#!/usr/bin/env python3
"""EventLens Photo Processing Pipeline.

Scans Google Drive folders, renames photos, generates Gemini descriptions +
text embeddings, and produces InsightFace face embeddings — all stored in Supabase.

@TheTechMargin 2026
"""

import argparse
import base64
import io
import json
import logging
import os
import re
import sys
import time
from collections import deque
from pathlib import Path

import requests
from dotenv import load_dotenv
from PIL import Image  # pylint: disable=import-error
from supabase import create_client, Client
from tenacity import (
    retry, stop_after_attempt, wait_exponential, retry_if_exception,
)
from tqdm import tqdm

log = logging.getLogger("eventlens")
handler = logging.StreamHandler(sys.stderr)
handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
log.addHandler(handler)
log.setLevel(logging.INFO)


class RateLimiter:
    """Enforces a maximum number of calls per 60-second window."""

    def __init__(self, max_per_minute: int):
        self.max_per_minute = max_per_minute
        self.timestamps: deque = deque()

    def wait(self):
        """Block until a call is allowed within the rate window."""
        now = time.time()
        while self.timestamps and self.timestamps[0] < now - 60:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.max_per_minute:
            sleep_time = 60 - (now - self.timestamps[0]) + 0.1
            log.debug("Rate limit: sleeping %.1fs", sleep_time)
            time.sleep(sleep_time)
        self.timestamps.append(time.time())



class Config:
    """Pipeline configuration loaded from a .env file."""

    def __init__(self, env_file: str):
        load_dotenv(env_file)
        self.google_api_key = os.environ.get("GOOGLE_API_KEY", "")
        self.drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        self.supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        self.supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.face_api_url = os.environ.get("FACE_API_URL", "")
        self.face_api_secret = os.environ.get("FACE_API_SECRET", "")

    def validate(self, phases: list[str]):
        """Exit if required env vars for the given phases are missing."""
        required = {"google_api_key", "drive_folder_id", "supabase_url", "supabase_key"}
        if "describe" in phases:
            required.add("gemini_api_key")
        missing = [k for k in required if not getattr(self, k)]
        if missing:
            log.error("Missing env vars: %s", ', '.join(missing))
            sys.exit(1)


DRIVE_API = "https://www.googleapis.com/drive/v3/files"


def _is_retryable(exc: BaseException) -> bool:
    if not isinstance(exc, requests.HTTPError):
        return False
    if exc.response is None:
        return False
    return exc.response.status_code in (429, 500, 502, 503)


class DriveClient:
    """Wrapper around the Google Drive v3 REST API."""

    def __init__(self, config: Config):
        self.api_key = config.google_api_key
        self.session = requests.Session()

    def _list(self, query: str, fields: str, order: str, page_size: int) -> list[dict]:
        """Paginated Drive files.list helper."""
        results: list[dict] = []
        page_token = None
        while True:
            params = {
                "q": query, "fields": f"files({fields}),nextPageToken",
                "orderBy": order, "pageSize": page_size, "key": self.api_key,
            }
            if page_token:
                params["pageToken"] = page_token
            r = self.session.get(DRIVE_API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            results.extend(data.get("files", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return results

    def list_subfolders(self, parent_id: str) -> list[dict]:
        """Return all direct sub-folders of *parent_id*."""
        q = (f"'{parent_id}' in parents"
             " and mimeType = 'application/vnd.google-apps.folder'"
             " and trashed = false")
        return self._list(q, "id,name", "name", 200)

    def list_images(self, folder_id: str) -> list[dict]:
        """Return all image/video files inside *folder_id*."""
        q = (f"'{folder_id}' in parents"
             " and (mimeType contains 'image/'"
             " or mimeType = 'video/quicktime'"
             " or mimeType = 'video/mp4')"
             " and trashed = false")
        return self._list(q, "id,name,mimeType,modifiedTime", "modifiedTime desc", 1000)

    def download_media_base64(
        self, file_id: str, width: int = 1200,
    ) -> tuple[str, str] | None:
        """Download an image/video as base64, trying CDN then Drive API."""
        cdn_url = f"https://lh3.googleusercontent.com/d/{file_id}=w{width}"
        for source, url, params, lvl in [
            ("CDN", cdn_url, {}, "debug"),
            ("Drive", f"{DRIVE_API}/{file_id}", {"alt": "media", "key": self.api_key}, "warning"),
        ]:
            try:
                r = self.session.get(url, params=params, timeout=30)
                if not r.ok:
                    getattr(log, lvl)("%s returned %d for %s", source, r.status_code, file_id)
                    continue
                ct = r.headers.get("content-type", "")
                if not ct.startswith(("image/", "video/")):
                    getattr(log, lvl)("%s non-media '%s' for %s", source, ct, file_id)
                    continue
                return base64.b64encode(r.content).decode(), ct
            except requests.RequestException as e:
                getattr(log, lvl)("%s failed for %s: %s", source, file_id, e)
        return None


_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_GENERATE = f"{_GEMINI_BASE}/{{model}}:generateContent"
GEMINI_BATCH_EMBED = f"{_GEMINI_BASE}/{{model}}:batchEmbedContents"

ANALYZE_PROMPT = (
    "Analyze this event photo and return ONLY valid JSON:\n"
    '{"visible_text":"…","people_descriptions":"…",'
    '"scene_description":"…","face_count":N}\n'
    "visible_text = readable text in photo (signs, banners, clothing). "
    "people_descriptions = semicolon-separated descriptions of people "
    "(appearance, clothing, activities). "
    "scene_description = setting, event type, atmosphere, objects. "
    "face_count = number of distinct faces. Be specific and factual."
)


def _parse_gemini_json(text: str) -> dict:
    cleaned = re.sub(r"```json\n?", "", re.sub(r"```\n?", "", text)).strip()
    for attempt in (cleaned, None):
        if attempt is None:
            # Salvage truncated JSON by closing open structures
            attempt = cleaned
            if attempt.count('"') % 2:
                attempt += '"'
            attempt += "}" * (attempt.count("{") - attempt.count("}"))
            attempt += "]" * (attempt.count("[") - attempt.count("]"))
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    # Last resort: regex extraction
    result: dict = {}
    for field in ("visible_text", "people_descriptions", "scene_description"):
        m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)', cleaned)
        result[field] = m.group(1) if m else ""
    m = re.search(r'"face_count"\s*:\s*(\d+)', cleaned)
    result["face_count"] = int(m.group(1)) if m else 0
    return result


class GeminiClient:
    """Client for the Gemini generative + embedding APIs."""

    def __init__(self, api_key: str, rpm: int = 30):
        self.api_key = api_key
        self.limiter = RateLimiter(rpm)
        self.session = requests.Session()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=16),
        retry=retry_if_exception(_is_retryable),
    )
    def analyze_photo(self, base64_data: str, mime_type: str) -> dict:
        """Send a photo to Gemini and return structured description."""
        self.limiter.wait()
        url = GEMINI_GENERATE.format(model="gemini-2.5-flash") + f"?key={self.api_key}"
        body = {
            "contents": [{"parts": [
                {"text": ANALYZE_PROMPT},
                {"inline_data": {"mime_type": mime_type, "data": base64_data}},
            ]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192},
        }
        r = self.session.post(url, json=body, timeout=120)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(
                f"Gemini error: {data['error'].get('message', data['error'])}"
            )
        candidates = data.get("candidates", [])
        if not candidates:
            # Gemini blocked the content (safety filter) or returned no output
            reason = data.get("promptFeedback", {}).get("blockReason", "unknown")
            log.warning("Gemini returned no candidates (reason: %s)", reason)
            return {
                "visible_text": "",
                "people_descriptions": "",
                "scene_description": "",
                "face_count": 0,
            }
        text = (
            candidates[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        parsed = _parse_gemini_json(text)
        fc = parsed.get("face_count", 0)
        return {
            "visible_text": str(parsed.get("visible_text", "")),
            "people_descriptions": str(parsed.get("people_descriptions", "")),
            "scene_description": str(parsed.get("scene_description", "")),
            "face_count": int(fc) if isinstance(fc, (int, float)) else 0,
        }

    def embed_texts_batch(
        self, texts: list[str], model: str = "gemini-embedding-001",
    ) -> list[list[float]]:
        """Generate 768-dim embeddings for a list of texts."""
        url = GEMINI_BATCH_EMBED.format(model=model) + f"?key={self.api_key}"
        reqs = [
            {
                "model": f"models/{model}",
                "content": {"parts": [{"text": t}]},
                "outputDimensionality": 768,
            }
            for t in texts
        ]
        # Gemini batch embed supports up to 100 per request
        all_embeddings = []
        for i in range(0, len(reqs), 100):
            chunk = reqs[i : i + 100]
            r = self.session.post(url, json={"requests": chunk}, timeout=60)
            r.raise_for_status()
            data = r.json()
            for emb in data.get("embeddings", []):
                all_embeddings.append(emb["values"])
        return all_embeddings



class FaceApiClient:
    """Client for the InsightFace embedding micro-service."""

    def __init__(self, base_url: str, secret: str = ""):
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.session = requests.Session()
        if secret:
            self.session.headers["Authorization"] = f"Bearer {secret}"

    def health_check(self, retries: int = 6, retry_delay: float = 5.0) -> bool:
        """Check reachability, retrying to allow for Railway cold-start (~30s)."""
        for attempt in range(1, retries + 1):
            try:
                r = self.session.get(f"{self.base_url}/health", timeout=10)
                if r.ok:
                    return True
            except requests.RequestException:
                pass
            if attempt < retries:
                log.info(
                    "  Face API not ready (%d/%d), retrying in %.0fs…",
                    attempt, retries, retry_delay,
                )
                time.sleep(retry_delay)
        return False

    def get_embeddings(self, base64_data: str) -> list[dict]:
        """Return face embeddings + bounding boxes for an image."""
        r = self.session.post(
            f"{self.base_url}/embed",
            json={"image": base64_data},
            timeout=60,
        )
        r.raise_for_status()
        return r.json().get("faces", [])



def dhash(base64_data: str) -> int:
    """Compute a 64-bit difference hash (dHash) from base64-encoded image data.

    Resizes to 9x8 grayscale, compares adjacent horizontal pixels to produce
    a 64-bit hash. Hamming distance <= 10 indicates near-duplicate images.
    """
    img = Image.open(io.BytesIO(base64.b64decode(base64_data)))
    img = img.convert("L").resize((9, 8), Image.LANCZOS)  # pylint: disable=no-member
    pixels = list(img.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            idx = row * 9 + col
            if pixels[idx] > pixels[idx + 1]:
                bits |= 1 << (row * 8 + col)
    # Convert to signed 64-bit int for PostgreSQL bigint compatibility
    if bits >= (1 << 63):
        bits -= 1 << 64
    return bits



class SupabaseStore:
    """Thin wrapper around the Supabase photos / face_embeddings tables."""

    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def _paginate(self, query_fn) -> list[dict]:
        """Execute *query_fn(offset, limit)* in pages until exhausted."""
        rows: list[dict] = []
        offset = 0
        while True:
            resp = query_fn(offset, 1000)
            rows.extend(resp.data)
            if len(resp.data) < 1000:
                break
            offset += 1000
        return rows

    def upsert_photo(self, photo: dict):
        """Insert-or-skip new photo, then refresh mutable metadata."""
        self.client.table("photos").upsert(
            photo, on_conflict="drive_file_id", ignore_duplicates=True,
        ).execute()
        self.client.table("photos").update({
            "filename": photo["filename"], "folder": photo["folder"],
            "drive_url": photo["drive_url"], "mime_type": photo["mime_type"],
        }).eq("drive_file_id", photo["drive_file_id"]).execute()

    def reconnect_photo(self, old_file_id: str, new_file_id: str, filename: str, folder: str):
        """Reassign a photo row to a new Drive file ID, preserving embeddings."""
        url = f"https://drive.google.com/file/d/{new_file_id}/view"
        meta = {"drive_file_id": new_file_id, "filename": filename, "folder": folder}
        self.client.table("face_embeddings").update(meta).eq("drive_file_id", old_file_id).execute()
        self.client.table("photos").update({**meta, "drive_url": url}).eq(
            "drive_file_id", old_file_id,
        ).execute()
        self.null_description_embedding(new_file_id)

    def delete_photo(self, drive_file_id: str):
        """Remove a photo and its face_embeddings (CASCADE)."""
        self.client.table("photos").delete().eq("drive_file_id", drive_file_id).execute()

    def get_all_photos(self) -> list[dict]:
        """Paginate through all rows in the photos table."""
        return self._paginate(
            lambda o, n: self.client.table("photos").select("*").range(o, o + n - 1).execute()
        )

    def get_photos_by_status(self, statuses: list[str]) -> list[dict]:
        """Return all photos whose status is in *statuses*."""
        return self._paginate(
            lambda o, n: self.client.table("photos").select("*")
            .in_("status", statuses).range(o, o + n - 1).execute()
        )

    def update_photo_metadata(self, drive_file_id: str, metadata: dict):
        """Patch arbitrary fields on a single photo row."""
        self.client.table("photos").update(
            metadata,
        ).eq("drive_file_id", drive_file_id).execute()

    def has_embedding_column(self) -> bool:
        """Check if description_embedding column exists on photos table."""
        try:
            self.client.table("photos").select("description_embedding").limit(1).execute()
            return True
        except Exception:  # pylint: disable=broad-except
            return False

    def update_description_embeddings_batch(self, updates: list[tuple[str, list[float]]]) -> int:
        """Batch-set description embeddings where not already present."""
        if not updates:
            return 0
        count = 0
        for file_id, emb in updates:
            resp = (self.client.table("photos")
                    .update({"description_embedding": emb})
                    .eq("drive_file_id", file_id)
                    .is_("description_embedding", "null").execute())
            if resp.data:
                count += 1
        return count

    def get_photos_missing_embedding(self) -> list[dict]:
        """Return completed photos that lack a description embedding."""
        return self._paginate(
            lambda o, n: self.client.table("photos").select("*")
            .eq("status", "completed").is_("description_embedding", "null")
            .range(o, o + n - 1).execute()
        )

    def get_existing_face_file_ids(self) -> set[str]:
        """Return drive_file_ids that already have face embeddings."""
        rows = self._paginate(
            lambda o, n: self.client.table("face_embeddings")
            .select("drive_file_id").range(o, o + n - 1).execute()
        )
        return {row["drive_file_id"] for row in rows}

    def null_description_embedding(self, drive_file_id: str):
        """Clear description embedding so it gets regenerated with updated metadata."""
        self.client.table("photos").update(
            {"description_embedding": None}
        ).eq("drive_file_id", drive_file_id).execute()

    def update_face_embedding_metadata(self, drive_file_id: str, metadata: dict):
        """Update filename/folder on face_embeddings rows for a given drive_file_id."""
        self.client.table("face_embeddings").update(
            metadata
        ).eq("drive_file_id", drive_file_id).execute()

    def upsert_face_embedding(self, row: dict):
        """Insert or update a single face embedding row."""
        self.client.table("face_embeddings").upsert(
            row, on_conflict="drive_file_id,face_index",
        ).execute()

    def update_phash(self, drive_file_id: str, phash_value: int):
        """Store the perceptual hash for a photo."""
        self.client.table("photos").update(
            {"phash": phash_value}
        ).eq("drive_file_id", drive_file_id).execute()

    def get_photos_missing_phash(self) -> list[dict]:
        """Return completed photos that lack a perceptual hash."""
        return self._paginate(
            lambda o, n: self.client.table("photos").select("*")
            .eq("status", "completed").is_("phash", "null")
            .range(o, o + n - 1).execute()
        )


def _log_errors(errors: list[str], phase: str):
    """Log a summary of errors if any occurred during a pipeline phase."""
    if errors:
        error_str = ", ".join(errors[:10]) + ("..." if len(errors) > 10 else "")
        log.warning("%d %s errors: %s", len(errors), phase, error_str)


def _face_sentinel(photo: dict) -> dict:
    """Build a sentinel face_embeddings row so this photo is not re-checked."""
    return {"drive_file_id": photo["drive_file_id"], "filename": photo["filename"],
            "folder": photo["folder"], "face_index": -1, "embedding": None,
            "bbox_x1": 0, "bbox_y1": 0, "bbox_x2": 0, "bbox_y2": 0}



def phase_sync(
    drive: DriveClient,
    store: SupabaseStore,
    config: Config,
    folder_filter: str | None,
) -> int:
    """Detect renames/moves in Drive and update stale Supabase metadata."""
    log.info("─── PHASE 0: SYNC ───")
    subfolders = drive.list_subfolders(config.drive_folder_id)
    all_folders = [{"id": config.drive_folder_id, "name": ""}] + subfolders
    log.info("Scanning %d folders", len(all_folders))

    drive_by_id: dict[str, dict] = {}
    drive_by_name: dict[str, dict] = {}
    for folder in tqdm(all_folders, desc="Scanning Drive"):
        for f in drive.list_images(folder["id"]):
            entry = {"name": f["name"], "folder": folder["name"], "id": f["id"]}
            drive_by_id[f["id"]] = entry
            drive_by_name[f["name"]] = entry

    all_photos = store.get_all_photos()
    if folder_filter:
        all_photos = [p for p in all_photos if p["folder"] == folder_filter]
    if not all_photos:
        log.info("No tracked photos to sync")
        return 0

    log.info("Checking %d tracked photos against Drive", len(all_photos))
    updated = reconnected = orphaned = 0

    for photo in tqdm(all_photos, desc="Syncing metadata"):
        fid = photo["drive_file_id"]
        sname, sfolder = photo.get("filename", ""), photo.get("folder", "")
        entry = drive_by_id.get(fid)
        if entry:
            changes: dict[str, str] = {}
            if entry["name"] != sname:
                changes["filename"] = entry["name"]
            if entry["folder"] != sfolder:
                changes["folder"] = entry["folder"]
            if changes:
                store.update_photo_metadata(fid, changes)
                store.null_description_embedding(fid)
                store.update_face_embedding_metadata(fid, changes)
                updated += 1
        else:
            match = drive_by_name.get(sname)
            if match and match["id"] != fid:
                store.reconnect_photo(fid, match["id"], sname, match["folder"])
                reconnected += 1
            else:
                store.delete_photo(fid)
                orphaned += 1

    log.info("Sync: %d updated, %d reconnected, %d orphaned", updated, reconnected, orphaned)
    return updated + reconnected


def phase_scan(
    drive: DriveClient, store: SupabaseStore,
    config: Config, folder_filter: str | None,
) -> int:
    """Discover photos from Drive folders and upsert into Supabase."""
    log.info("─── PHASE 1: SCAN ───")
    subfolders = drive.list_subfolders(config.drive_folder_id)
    all_folders = [{"id": config.drive_folder_id, "name": "root"}] + subfolders
    log.info("Found %d folders (including root)", len(all_folders))

    if folder_filter:
        all_folders = [f for f in all_folders if f["name"] == folder_filter]
        if not all_folders:
            log.error("Folder '%s' not found", folder_filter)
            return 0

    discovered = 0
    for folder in tqdm(all_folders, desc="Scanning folders"):
        files = drive.list_images(folder["id"])
        for f in files:
            store.upsert_photo({
                "drive_file_id": f["id"],
                "filename": f["name"],
                "drive_url": f"https://drive.google.com/file/d/{f['id']}/view",
                "folder": "" if folder["name"] == "root" else folder["name"],
                "mime_type": f.get("mimeType", ""),
                "status": "pending",
            })
            discovered += 1
    log.info("Scan complete: %d photos discovered", discovered)
    return discovered


def phase_describe(
    drive: DriveClient,
    gemini: GeminiClient,
    store: SupabaseStore,
    batch_size: int,
    folder_filter: str | None,
) -> int:
    """Generate Gemini descriptions for pending/error photos."""
    log.info("─── PHASE 2: DESCRIBE ───")
    if not _check_embedding_column(store):
        return 0
    photos = store.get_photos_by_status(["pending", "error"])
    if folder_filter:
        photos = [p for p in photos if p["folder"] == folder_filter]

    if not photos:
        log.info("No photos to describe")
        return 0

    pending_count = sum(1 for p in photos if p["status"] == "pending")
    error_count = len(photos) - pending_count
    log.info("%d photos to process (%d pending, %d error retry)",
             len(photos), pending_count, error_count)
    errors = []
    processed = 0

    for i in range(0, len(photos), batch_size):
        batch = photos[i : i + batch_size]
        batch_described = []

        interrupted = False
        for photo in tqdm(batch, desc=f"Describe batch {i // batch_size + 1}"):
            fid = photo["drive_file_id"]
            try:
                img = drive.download_media_base64(fid)
                if not img:
                    log.warning("  Could not download %s", photo['filename'])
                    store.update_photo_metadata(fid, {
                        "status": "error",
                        "error_message": "Download failed",
                    })
                    errors.append(photo["filename"])
                    continue

                b64, mime = img
                result = gemini.analyze_photo(b64, mime)
                result.update(status="completed", error_message=None,
                              processed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
                store.update_photo_metadata(fid, result)
                batch_described.append({**photo, **result})
                processed += 1
            except KeyboardInterrupt:
                log.info("Interrupted — saving progress")
                interrupted = True
                break
            except (IOError, ValueError, RuntimeError) as e:
                log.error("  Failed %s: %s", photo['filename'], e)
                store.update_photo_metadata(fid, {"status": "error", "error_message": str(e)[:500]})
                errors.append(photo["filename"])

        # Generate text embeddings for this batch
        if batch_described:
            _embed_descriptions(gemini, store, batch_described)

        if interrupted:
            break

    _log_errors(errors, "describe")
    log.info("Describe complete: %d photos processed", processed)
    return processed


def phase_embed_only(
    gemini: GeminiClient, store: SupabaseStore,
    folder_filter: str | None,
) -> int:
    """Back-fill description embeddings for completed photos."""
    log.info("─── TEXT EMBEDDINGS ONLY ───")
    if not _check_embedding_column(store):
        return 0
    photos = store.get_photos_missing_embedding()
    if folder_filter:
        photos = [p for p in photos if p["folder"] == folder_filter]
    if not photos:
        log.info("All photos already have description embeddings")
        return 0
    log.info("%d photos missing description embeddings", len(photos))
    return _embed_descriptions(gemini, store, photos)


def _check_embedding_column(store: SupabaseStore) -> bool:
    if not store.has_embedding_column():
        log.error(
            "Column 'description_embedding' does not exist on photos table.\n"
            "  Run the migration in supabase/migrations/003_description_embeddings.sql\n"
            "  via the Supabase dashboard SQL Editor, then retry."
        )
        return False
    return True


def _embed_descriptions(gemini: GeminiClient, store: SupabaseStore, photos: list[dict]) -> int:
    texts = []
    file_ids = []
    for p in photos:
        combined = " ".join(filter(None, [
            p.get("visible_text", ""),
            p.get("people_descriptions", ""),
            p.get("scene_description", ""),
            p.get("filename", ""),
            p.get("folder", ""),
        ]))
        if combined.strip():
            texts.append(combined)
            file_ids.append(p["drive_file_id"])

    if not texts:
        return 0

    log.info("Embedding %d descriptions...", len(texts))
    try:
        embeddings = gemini.embed_texts_batch(texts)
        total_saved = 0
        for i in range(0, len(file_ids), 100):
            batch_updates = list(zip(file_ids[i:i + 100], embeddings[i:i + 100]))
            total_saved += store.update_description_embeddings_batch(batch_updates)
        log.info("Stored %d description embeddings", total_saved)
        return total_saved
    except (IOError, ValueError, RuntimeError) as e:
        log.error("Embedding batch failed: %s", e)
        return 0


def phase_face_embed(
    drive: DriveClient,
    face_api: FaceApiClient,
    store: SupabaseStore,
    folder_filter: str | None,
) -> int:
    """Generate InsightFace embeddings for photos missing them."""
    log.info("─── PHASE 3: FACE EMBED ───")
    if not face_api.health_check():
        log.error(
            "Face API at %s is not reachable. "
            "Use --skip-face-embed or start the service.",
            face_api.base_url,
        )
        return 0

    all_photos = store.get_photos_by_status(["pending", "completed"])
    if folder_filter:
        all_photos = [p for p in all_photos if p["folder"] == folder_filter]

    already_done = store.get_existing_face_file_ids()
    todo = [p for p in all_photos if p["drive_file_id"] not in already_done]
    log.info("Skipping %d photos already face-embedded", len(all_photos) - len(todo))

    if not todo:
        log.info("No completed photos to process")
        return 0

    log.info("%d photos to process for face embeddings", len(todo))
    processed = 0
    errors = []

    for photo in tqdm(todo, desc="Face embeddings"):
        fid = photo["drive_file_id"]
        stored_mime = photo.get("mime_type", "")
        if stored_mime.startswith("video/"):
            log.debug("  Skipping video %s", photo["filename"])
            store.upsert_face_embedding(_face_sentinel(photo))
            continue
        try:
            img = drive.download_media_base64(fid)
            if not img:
                log.warning("  Could not download %s", photo['filename'])
                errors.append(photo["filename"])
                continue

            b64, mime = img
            if mime.startswith('video/'):
                log.debug("  Skipping video %s for face embedding", photo['filename'])
                continue

            faces = face_api.get_embeddings(b64)
            if not faces:
                store.upsert_face_embedding(_face_sentinel(photo))
            for face in faces:
                bb = (face.get("bbox") or [0, 0, 0, 0])[:4]
                bb += [0] * (4 - len(bb))
                store.upsert_face_embedding({
                    "drive_file_id": fid, "filename": photo["filename"],
                    "folder": photo["folder"], "face_index": face["index"],
                    "embedding": face["embedding"],
                    "bbox_x1": bb[0], "bbox_y1": bb[1],
                    "bbox_x2": bb[2], "bbox_y2": bb[3],
                })
            processed += 1
            time.sleep(0.5)  # Don't overwhelm single-worker Flask
        except KeyboardInterrupt:
            log.info("Interrupted — saving progress")
            break
        except (IOError, ValueError, RuntimeError) as e:
            log.error("  Failed %s: %s", photo['filename'], e)
            errors.append(photo["filename"])

    _log_errors(errors, "face_embed")
    log.info("Face embed complete: %d photos processed", processed)
    return processed


def phase_phash(
    drive: DriveClient,
    store: SupabaseStore,
    folder_filter: str | None,
) -> int:
    """Compute dHash perceptual hashes for photos missing them."""
    log.info("─── PHASE: PHASH ───")
    photos = store.get_photos_missing_phash()
    if folder_filter:
        photos = [p for p in photos if p["folder"] == folder_filter]

    if not photos:
        log.info("All photos already have perceptual hashes")
        return 0

    log.info("%d photos missing perceptual hashes", len(photos))
    processed = 0
    errors = []

    for photo in tqdm(photos, desc="Computing dHash"):
        fid = photo["drive_file_id"]
        try:
            # Download a small thumbnail — dHash only needs low-res
            img = drive.download_media_base64(fid, width=64)
            if not img:
                log.warning("  Could not download %s", photo["filename"])
                errors.append(photo["filename"])
                continue

            b64, mime = img
            if mime.startswith("video/"):
                log.debug("  Skipping video %s for phash", photo["filename"])
                continue

            hash_value = dhash(b64)
            store.update_phash(fid, hash_value)
            processed += 1
        except KeyboardInterrupt:
            log.info("Interrupted — saving progress")
            break
        except (IOError, ValueError, RuntimeError) as e:
            log.error("  Failed %s: %s", photo["filename"], e)
            errors.append(photo["filename"])

    _log_errors(errors, "phash")
    log.info("Phash complete: %d photos hashed", processed)
    return processed



def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the pipeline."""
    p = argparse.ArgumentParser(description="EventLens Photo Processing Pipeline")
    a = p.add_argument
    a("--dry-run", action="store_true", help="Preview without changes")
    a("--skip-describe", action="store_true", help="Skip Gemini description")
    a("--skip-face-embed", action="store_true", help="Skip InsightFace")
    a("--only-scan", action="store_true", help="Scan phase only")
    a("--only-describe", action="store_true", help="Describe + embed only")
    a("--only-embeddings", action="store_true", help="Text embeddings only")
    a("--only-face-embed", action="store_true", help="Face embeddings only")
    a("--only-sync", action="store_true", help="Sync metadata only")
    a("--only-phash", action="store_true", help="Perceptual hashes only")
    a("--retry-errors", action="store_true", help="Re-process error photos")
    a("--batch-size", type=int, default=50, help="Gemini batch size")
    a("--folder", type=str, help="Process specific subfolder only")
    a("--gemini-rpm", type=int, default=30, help="Gemini RPM limit")
    a("--env-file", type=str, help="Path to env file")
    a("--face-api-url", type=str, help="Override FACE_API_URL")
    a("--verbose", action="store_true", help="Debug logging")
    return p.parse_args()


def _dry_run(phases, args, drive, store, config):
    """Preview what each phase would do without making changes."""
    log.info("[DRY RUN MODE] — previewing counts only")
    ff = args.folder

    def _filter(rows):
        return [p for p in rows if p["folder"] == ff] if ff else rows

    if "scan" in phases:
        folders = [{"id": config.drive_folder_id, "name": "root"}]
        folders += drive.list_subfolders(config.drive_folder_id)
        if ff:
            folders = [f for f in folders if f["name"] == ff]
        log.info("  scan: %d photos", sum(len(drive.list_images(f["id"])) for f in folders))
    if "describe" in phases:
        pending = _filter(store.get_photos_by_status(["pending", "error"]))
        pc = sum(1 for p in pending if p["status"] == "pending")
        log.info("  describe: %d (%d pending, %d error)", len(pending), pc, len(pending) - pc)
    if "embeddings" in phases:
        log.info("  embeddings: %d missing", len(_filter(store.get_photos_missing_embedding())))
    if "phash" in phases:
        log.info("  phash: %d missing", len(_filter(store.get_photos_missing_phash())))
    if "face_embed" in phases:
        cands = _filter(store.get_photos_by_status(["pending", "completed"]))
        already = store.get_existing_face_file_ids()
        log.info("  face_embed: %d", len([p for p in cands if p["drive_file_id"] not in already]))
    if args.retry_errors:
        log.info("  retry-errors: %d", len(_filter(store.get_photos_by_status(["error"]))))


def main():
    """Entry point: parse args, init clients, run selected pipeline phases."""
    args = parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    # Resolve env file
    project_root = Path(__file__).resolve().parent.parent
    env_file = args.env_file or str(project_root / ".env.local")
    if not Path(env_file).exists():
        log.error("Env file not found: %s", env_file)
        sys.exit(1)

    config = Config(env_file)
    if args.face_api_url:
        config.face_api_url = args.face_api_url

    # Determine which phases to run
    only_flags = [
        args.only_scan, args.only_describe, args.only_embeddings,
        args.only_face_embed, args.only_sync, args.only_phash,
    ]
    run_all = not any(only_flags)

    phases = []
    if run_all or args.only_sync:
        phases.append("sync")
    if run_all or args.only_scan:
        phases.append("scan")
    if (run_all and not args.skip_describe) or args.only_describe:
        phases.append("describe")
    if args.only_embeddings:
        phases.append("embeddings")
    if run_all or args.only_phash:
        phases.append("phash")
    if (run_all and not args.skip_face_embed) or args.only_face_embed:
        phases.append("face_embed")

    config.validate(phases)

    # Initialize clients
    store = SupabaseStore(config.supabase_url, config.supabase_key)
    drive = DriveClient(config)
    gemini = GeminiClient(config.gemini_api_key, args.gemini_rpm) if config.gemini_api_key else None
    face_api = None
    if config.face_api_url and "face_embed" in phases:
        face_api = FaceApiClient(config.face_api_url, config.face_api_secret)

    log.info("EventLens Photo Pipeline — phases: %s", ', '.join(phases))

    # Dry-run: report what *would* happen, then exit without mutations
    if args.dry_run:
        _dry_run(phases, args, drive, store, config)
        return

    # Re-queue errored photos so they get picked up by describe/face phases
    if args.retry_errors:
        errored = store.get_photos_by_status(["error"])
        if args.folder:
            errored = [p for p in errored if p["folder"] == args.folder]
        for p in errored:
            store.update_photo_metadata(
                p["drive_file_id"], {"status": "pending", "error_message": None},
            )
        log.info("Re-queued %d errored photos for retry", len(errored))

    results: dict[str, int] = {}
    ff = args.folder
    try:
        if "sync" in phases:
            results["sync"] = phase_sync(drive, store, config, ff)
        if "scan" in phases:
            results["scan"] = phase_scan(drive, store, config, ff)
        if "describe" in phases and gemini:
            results["describe"] = phase_describe(drive, gemini, store, args.batch_size, ff)
        if "embeddings" in phases and gemini:
            results["embeddings"] = phase_embed_only(gemini, store, ff)
        if "phash" in phases:
            results["phash"] = phase_phash(drive, store, ff)
        if "face_embed" in phases and face_api:
            results["face_embed"] = phase_face_embed(drive, face_api, store, ff)
    except KeyboardInterrupt:
        log.info("\nInterrupted by user")

    log.info("─── SUMMARY ───")
    for name, count in results.items():
        log.info("  %s: %d", name, count)


if __name__ == "__main__":
    main()
