#!/usr/bin/env python3
"""EventLens Auto-Tag: Cluster photos by embedding similarity and name clusters via Gemini.

Standalone script — run after a full processing pass to generate thematic album tags.
Dependencies: numpy, scikit-learn (not needed by the Next.js app).

Usage:
    python scripts/auto_tag_photos.py                  # auto-pick best k via silhouette
    python scripts/auto_tag_photos.py --k 8            # force 8 clusters
    python scripts/auto_tag_photos.py --dry-run        # preview without updating DB

@TheTechMargin 2026
"""

import argparse
import logging
import os
import sys
from pathlib import Path

import numpy as np
import requests
from dotenv import load_dotenv
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from supabase import create_client
from tenacity import RetryError, retry, retry_if_exception, stop_after_attempt, wait_exponential

log = logging.getLogger("eventlens-autotag")
handler = logging.StreamHandler(sys.stderr)
handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
log.addHandler(handler)
log.setLevel(logging.INFO)

GEMINI_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

NAMING_PROMPT = """\
These are descriptions of event photos in one group.
Give this group a short, descriptive album name (2-4 words).
Examples: "Stage & Keynotes", "Networking", "Food & Drinks",
"Outdoor Activities", "Group Photos", "Expo Booths".

Descriptions:
{descriptions}

Respond with ONLY the album name, nothing else."""


def _is_retryable(exc: BaseException) -> bool:
    if not isinstance(exc, requests.HTTPError):
        return False
    if exc.response is None:
        return False
    return exc.response.status_code in (429, 500, 502, 503)


@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=16),
    retry=retry_if_exception(_is_retryable),
)
def _call_gemini(url: str, body: dict) -> str:
    """POST to Gemini with retry on transient errors. Returns the text response."""
    r = requests.post(url, json=body, timeout=30)
    r.raise_for_status()
    data = r.json()
    candidates = data.get("candidates", [])
    if not candidates:
        return ""
    return (
        candidates[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )


def name_cluster(descriptions: list[str], gemini_api_key: str) -> str:
    """Use Gemini Flash to generate a short album name from scene descriptions."""
    # Sample up to 20 descriptions to keep the prompt small
    sampled = descriptions[:20]
    prompt = NAMING_PROMPT.format(descriptions="\n".join(f"- {d}" for d in sampled))

    url = GEMINI_GENERATE.format(model="gemini-3.1-flash-lite-preview") + f"?key={gemini_api_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 50},
    }
    try:
        text = _call_gemini(url, body)
        # Clean up: strip quotes, newlines, extra whitespace
        name = text.strip().strip('"').strip("'").strip()
        return name if name else "Uncategorized"
    except (requests.RequestException, RetryError) as e:
        log.warning("Gemini naming failed: %s — using fallback", e)
        return "Uncategorized"


def find_best_k(embeddings: np.ndarray, k_min: int = 5, k_max: int = 12) -> int:
    """Pick k with the best silhouette score."""
    n_samples = len(embeddings)
    k_max = min(k_max, n_samples - 1)
    k_min = max(2, min(k_min, k_max))
    k_max = max(k_min, k_max)

    if k_min == k_max:
        return k_min

    best_k = k_min
    best_score = -1.0

    for k in range(k_min, k_max + 1):
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(embeddings)
        score = silhouette_score(embeddings, labels, sample_size=min(5000, n_samples))
        log.info("  k=%d  silhouette=%.4f", k, score)
        if score > best_score:
            best_score = score
            best_k = k

    log.info("Best k=%d (silhouette=%.4f)", best_k, best_score)
    return best_k


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    p = argparse.ArgumentParser(
        description="Auto-tag photos by embedding clustering",
    )
    p.add_argument(
        "--k", type=int, default=0,
        help="Force number of clusters (0 = auto)",
    )
    p.add_argument(
        "--k-min", type=int, default=5,
        help="Min k for auto selection (default: 5)",
    )
    p.add_argument(
        "--k-max", type=int, default=12,
        help="Max k for auto selection (default: 12)",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Preview clusters without updating DB",
    )
    p.add_argument(
        "--env-file", type=str,
        help="Path to env file (default: .env.local)",
    )
    p.add_argument(
        "--verbose", action="store_true",
        help="Debug logging",
    )
    return p.parse_args()


def main():
    """Cluster photos by embedding similarity and assign album tags."""
    args = parse_args()
    if args.verbose:
        log.setLevel(logging.DEBUG)

    project_root = Path(__file__).resolve().parent.parent
    env_file = args.env_file or str(project_root / ".env.local")
    if not Path(env_file).exists():
        log.error("Env file not found: %s", env_file)
        sys.exit(1)

    load_dotenv(env_file)
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "")

    if not supabase_url or not supabase_key:
        log.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    if not gemini_api_key:
        log.error("Missing GEMINI_API_KEY (needed for cluster naming)")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    # Fetch all completed photos with embeddings
    log.info("Fetching photos with embeddings...")
    rows = []
    offset = 0
    while True:
        resp = (
            supabase.table("photos")
            .select("id, drive_file_id, filename, folder, scene_description, description_embedding")
            .eq("status", "completed")
            .not_.is_("description_embedding", "null")
            .range(offset, offset + 999)
            .execute()
        )
        rows.extend(resp.data)
        if len(resp.data) < 1000:
            break
        offset += 1000

    if not rows:
        log.info("No photos with embeddings found")
        return

    if len(rows) < 3:
        log.error("Need at least 3 photos with embeddings to cluster (got %d)", len(rows))
        return

    log.info("Loaded %d photos with embeddings", len(rows))

    # Build embedding matrix
    embeddings = np.array([r["description_embedding"] for r in rows], dtype=np.float32)

    # Determine k
    if args.k > 0:
        k = max(2, min(args.k, len(rows) - 1))
        log.info("Using forced k=%d", k)
    else:
        log.info("Finding optimal k (range %d-%d)...", args.k_min, args.k_max)
        k = find_best_k(embeddings, args.k_min, args.k_max)

    # Run final k-means
    log.info("Running k-means with k=%d...", k)
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = km.fit_predict(embeddings)

    # Group photos by cluster
    clusters: dict[int, list[dict]] = {}
    for i, row in enumerate(rows):
        label = int(labels[i])
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(row)

    # Name each cluster via Gemini
    log.info("Naming %d clusters via Gemini...", len(clusters))
    cluster_names: dict[int, str] = {}
    for label, members in sorted(clusters.items()):
        descriptions = [
            m.get("scene_description", "") for m in members
            if m.get("scene_description")
        ]
        name = name_cluster(descriptions, gemini_api_key)
        cluster_names[label] = name
        sample_files = [m["filename"] for m in members[:3]]
        log.info(
            "  Cluster %d: \"%s\" (%d photos) — e.g. %s",
            label, name, len(members), ", ".join(sample_files),
        )

    # Summary
    log.info("─── SUMMARY ───")
    for label in sorted(clusters):
        log.info("  %-30s %d photos", cluster_names[label], len(clusters[label]))

    if args.dry_run:
        log.info("[DRY RUN] No database updates made")
        return

    # Update auto_tag in Supabase
    log.info("Updating auto_tag in Supabase...")
    total_updated = 0
    for label, members in clusters.items():
        tag_name = cluster_names[label]
        ids = [m["id"] for m in members]
        # Batch update in chunks of 100
        for i in range(0, len(ids), 100):
            chunk = ids[i : i + 100]
            supabase.table("photos").update({"auto_tag": tag_name}).in_("id", chunk).execute()
            total_updated += len(chunk)

    log.info("Updated %d photos with auto_tag", total_updated)


if __name__ == "__main__":
    main()
