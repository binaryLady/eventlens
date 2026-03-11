#!/usr/bin/env python3
"""EventLens Photo Processing Pipeline.

Scans Google Drive folders, renames photos, generates Gemini descriptions +
text embeddings, and produces InsightFace face embeddings — all stored in Supabase.

@TheTechMargin 2026
"""

import argparse
import base64
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
from supabase import create_client, Client
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from tqdm import tqdm

# ── Logging ────────────────────────────────────────────────────────

log = logging.getLogger("eventlens")
handler = logging.StreamHandler(sys.stderr)
handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
log.addHandler(handler)
log.setLevel(logging.INFO)

# ── Rate Limiter ───────────────────────────────────────────────────


class RateLimiter:
    def __init__(self, max_per_minute: int):
        self.max_per_minute = max_per_minute
        self.timestamps: deque = deque()

    def wait(self):
        now = time.time()
        while self.timestamps and self.timestamps[0] < now - 60:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.max_per_minute:
            sleep_time = 60 - (now - self.timestamps[0]) + 0.1
            log.debug("Rate limit: sleeping %.1fs", sleep_time)
            time.sleep(sleep_time)
        self.timestamps.append(time.time())


# ── Configuration ──────────────────────────────────────────────────


class Config:
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
        required = {"google_api_key", "drive_folder_id", "supabase_url", "supabase_key"}
        if "describe" in phases:
            required.add("gemini_api_key")
        missing = [k for k in required if not getattr(self, k)]
        if missing:
            log.error("Missing env vars: %s", ', '.join(missing))
            sys.exit(1)


# ── Google Drive Client ────────────────────────────────────────────

DRIVE_API = "https://www.googleapis.com/drive/v3/files"


def _is_rate_limited(exc: BaseException) -> bool:
    return isinstance(exc, requests.HTTPError) and exc.response is not None and exc.response.status_code == 429


class DriveClient:
    def __init__(self, config: Config):
        self.api_key = config.google_api_key

    def list_subfolders(self, parent_id: str) -> list[dict]:
        folders = []
        page_token = None
        while True:
            q = f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            params = {
                "q": q,
                "fields": "files(id,name),nextPageToken",
                "orderBy": "name",
                "pageSize": 200,
                "key": self.api_key,
            }
            if page_token:
                params["pageToken"] = page_token
            r = requests.get(DRIVE_API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            folders.extend(data.get("files", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return folders

    def list_images(self, folder_id: str) -> list[dict]:
        files = []
        page_token = None
        while True:
            q = f"'{folder_id}' in parents and (mimeType contains 'image/' or mimeType = 'video/quicktime' or mimeType = 'video/mp4') and trashed = false"
            params = {
                "q": q,
                "fields": "files(id,name,mimeType,modifiedTime),nextPageToken",
                "orderBy": "modifiedTime desc",
                "pageSize": 1000,
                "key": self.api_key,
            }
            if page_token:
                params["pageToken"] = page_token
            r = requests.get(DRIVE_API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            files.extend(data.get("files", []))
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return files

    def get_file_metadata(self, file_id: str) -> dict | None:
        """Fetch current name and parents for a single file. Returns None if deleted/inaccessible."""
        url = f"{DRIVE_API}/{file_id}"
        params = {"fields": "name,parents,trashed", "key": self.api_key}
        r = requests.get(url, params=params, timeout=15)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def download_media_base64(self, file_id: str, width: int = 1200) -> tuple[str, str] | None:
        # Try lh3 CDN first (fast, no auth needed)
        try:
            r = requests.get(f"https://lh3.googleusercontent.com/d/{file_id}=w{width}", timeout=30)
            if r.ok:
                ct = r.headers.get("content-type", "")
                if ct.startswith("image/") or ct.startswith("video/"):
                    return base64.b64encode(r.content).decode(), ct
        except requests.RequestException:
            pass

        # Fallback: Drive API
        try:
            r = requests.get(
                f"{DRIVE_API}/{file_id}",
                params={"alt": "media", "key": self.api_key},
                timeout=30,
            )
            if not r.ok:
                return None
            ct = r.headers.get("content-type", "")
            if not (ct.startswith("image/") or ct.startswith("video/")):
                return None
            return base64.b64encode(r.content).decode(), ct
        except requests.RequestException:
            return None


# ── Gemini Client ──────────────────────────────────────────────────

GEMINI_GENERATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_BATCH_EMBED = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"

ANALYZE_PROMPT = """Analyze this event photo and provide structured information in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "visible_text": "any text visible in the photo (signs, banners, clothing text, etc.) - if none, use empty string",
  "people_descriptions": "brief descriptions of people visible, separated by semicolons - focus on appearance, clothing, activities",
  "scene_description": "description of the setting, event type, atmosphere, and notable objects",
  "face_count": number of distinct faces visible in the photo
}

Be specific and factual. For visible_text, only include actual readable text. For people_descriptions, describe each person briefly. For scene_description, describe the environment and context."""


def _parse_gemini_json(text: str) -> dict:
    cleaned = re.sub(r"```json\n?", "", text)
    cleaned = re.sub(r"```\n?", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Response may be truncated — attempt to salvage by closing open structures
        salvaged = cleaned
        # Close any open string
        open_strings = salvaged.count('"') % 2
        if open_strings:
            salvaged += '"'
        # Close open objects/arrays
        salvaged += "}" * (salvaged.count("{") - salvaged.count("}"))
        salvaged += "]" * (salvaged.count("[") - salvaged.count("]"))
        try:
            return json.loads(salvaged)
        except json.JSONDecodeError:
            # Last resort: extract whatever fields we can via regex
            result = {}
            for field in ("visible_text", "people_descriptions", "scene_description"):
                m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)', salvaged)
                result[field] = m.group(1) if m else ""
            m = re.search(r'"face_count"\s*:\s*(\d+)', salvaged)
            result["face_count"] = int(m.group(1)) if m else 0
            return result


class GeminiClient:
    def __init__(self, api_key: str, rpm: int = 30):
        self.api_key = api_key
        self.limiter = RateLimiter(rpm)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=16),
           retry=retry_if_exception(_is_rate_limited))
    def analyze_photo(self, base64_data: str, mime_type: str) -> dict:
        self.limiter.wait()
        url = GEMINI_GENERATE.format(model="gemini-2.5-flash") + f"?key={self.api_key}"
        body = {
            "contents": [{"parts": [
                {"text": ANALYZE_PROMPT},
                {"inline_data": {"mime_type": mime_type, "data": base64_data}},
            ]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 8192},
        }
        r = requests.post(url, json=body, timeout=120)
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(f"Gemini error: {data['error'].get('message', data['error'])}")
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        parsed = _parse_gemini_json(text)
        return {
            "visible_text": str(parsed.get("visible_text", "")),
            "people_descriptions": str(parsed.get("people_descriptions", "")),
            "scene_description": str(parsed.get("scene_description", "")),
            "face_count": int(parsed.get("face_count", 0)) if isinstance(parsed.get("face_count"), (int, float)) else 0,
        }

    def embed_texts_batch(self, texts: list[str], model: str = "gemini-embedding-001") -> list[list[float]]:
        url = GEMINI_BATCH_EMBED.format(model=model) + f"?key={self.api_key}"
        reqs = [
            {"model": f"models/{model}", "content": {"parts": [{"text": t}]}, "outputDimensionality": 768}
            for t in texts
        ]
        # Gemini batch embed supports up to 100 per request
        all_embeddings = []
        for i in range(0, len(reqs), 100):
            chunk = reqs[i : i + 100]
            r = requests.post(url, json={"requests": chunk}, timeout=60)
            r.raise_for_status()
            data = r.json()
            for emb in data.get("embeddings", []):
                all_embeddings.append(emb["values"])
        return all_embeddings


# ── Face API Client ────────────────────────────────────────────────


class FaceApiClient:
    def __init__(self, base_url: str, secret: str = ""):
        self.base_url = base_url.rstrip("/")
        self.secret = secret

    def health_check(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/health", timeout=5)
            return r.ok
        except requests.RequestException:
            return False

    def get_embeddings(self, base64_data: str) -> list[dict]:
        headers = {}
        if self.secret:
            headers["Authorization"] = f"Bearer {self.secret}"
        r = requests.post(
            f"{self.base_url}/embed",
            json={"image": base64_data},
            headers=headers,
            timeout=60,
        )
        r.raise_for_status()
        return r.json().get("faces", [])


# ── Supabase Store ─────────────────────────────────────────────────


class SupabaseStore:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def upsert_photo(self, photo: dict):
        """Insert new photo or update filename/folder/drive_url/mime_type for existing.

        Uses two calls: an insert that skips duplicates (to set status=pending
        only for genuinely new rows), then an update that refreshes metadata
        fields without clobbering status or description data.
        """
        # Insert only if new — sets status='pending' for fresh discoveries
        self.client.table("photos").upsert(
            photo, on_conflict="drive_file_id", ignore_duplicates=True
        ).execute()

        # Always refresh mutable metadata (handles renames/moves)
        self.client.table("photos").update({
            "filename": photo["filename"],
            "folder": photo["folder"],
            "drive_url": photo["drive_url"],
            "mime_type": photo["mime_type"],
        }).eq("drive_file_id", photo["drive_file_id"]).execute()

    def get_all_photos(self) -> list[dict]:
        rows = []
        offset = 0
        while True:
            resp = self.client.table("photos").select("*").range(offset, offset + 999).execute()
            rows.extend(resp.data)
            if len(resp.data) < 1000:
                break
            offset += 1000
        return rows

    def get_photos_by_status(self, statuses: list[str]) -> list[dict]:
        rows = []
        offset = 0
        while True:
            resp = (
                self.client.table("photos")
                .select("*")
                .in_("status", statuses)
                .range(offset, offset + 999)
                .execute()
            )
            rows.extend(resp.data)
            if len(resp.data) < 1000:
                break
            offset += 1000
        return rows

    def update_photo_metadata(self, drive_file_id: str, metadata: dict):
        self.client.table("photos").update(metadata).eq("drive_file_id", drive_file_id).execute()

    def has_embedding_column(self) -> bool:
        """Check if description_embedding column exists on photos table."""
        try:
            self.client.table("photos").select("description_embedding").limit(1).execute()
            return True
        except Exception:  # pylint: disable=broad-except
            return False

    def update_description_embedding(self, drive_file_id: str, embedding: list[float]):
        self.client.table("photos").update(
            {"description_embedding": embedding}
        ).eq("drive_file_id", drive_file_id).execute()

    def update_description_embeddings_batch(self, updates: list[tuple[str, list[float]]]) -> int:
        """Batch update description embeddings, only if not already set.
        
        Args:
            updates: List of (drive_file_id, embedding) tuples
            
        Returns:
            Number of embeddings updated
        """
        if not updates:
            return 0
        
        updated_count = 0
        for file_id, emb in updates:
            # Only update if description_embedding is null (add only, don't overwrite)
            resp = self.client.table("photos").update(
                {"description_embedding": emb}
            ).eq("drive_file_id", file_id).is_("description_embedding", "null").execute()
            if resp.data:
                updated_count += 1
        
        return updated_count

    def get_photos_missing_embedding(self) -> list[dict]:
        rows = []
        offset = 0
        while True:
            resp = (
                self.client.table("photos")
                .select("*")
                .eq("status", "completed")
                .is_("description_embedding", "null")
                .range(offset, offset + 999)
                .execute()
            )
            rows.extend(resp.data)
            if len(resp.data) < 1000:
                break
            offset += 1000
        return rows

    def get_existing_face_file_ids(self) -> set[str]:
        ids = set()
        offset = 0
        while True:
            resp = (
                self.client.table("face_embeddings")
                .select("drive_file_id")
                .range(offset, offset + 999)
                .execute()
            )
            for row in resp.data:
                ids.add(row["drive_file_id"])
            if len(resp.data) < 1000:
                break
            offset += 1000
        return ids

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
        self.client.table("face_embeddings").upsert(row, on_conflict="drive_file_id,face_index").execute()


# ── Pipeline Phases ────────────────────────────────────────────────


def phase_sync(
    drive: DriveClient,
    store: SupabaseStore,
    config: Config,
    folder_filter: str | None,
) -> int:
    """Detect renames/moves in Google Drive and update stale metadata.

    Compares stored filename/folder against current Drive state.
    Nulls description_embedding for changed files so they get re-embedded
    with corrected metadata on the next --only-embeddings run.
    """
    log.info("─── PHASE 0: SYNC ───")

    # Build folder-ID → name map
    subfolders = drive.list_subfolders(config.drive_folder_id)
    folder_id_to_name: dict[str, str] = {f["id"]: f["name"] for f in subfolders}
    folder_id_to_name[config.drive_folder_id] = ""  # root = empty string

    # Fetch all tracked photos
    all_photos = store.get_all_photos()
    if folder_filter:
        all_photos = [p for p in all_photos if p["folder"] == folder_filter]

    if not all_photos:
        log.info("No tracked photos to sync")
        return 0

    log.info("Checking %d tracked photos against Drive", len(all_photos))
    limiter = RateLimiter(600)  # Drive read quota is generous
    updated = 0
    missing = 0

    for photo in tqdm(all_photos, desc="Syncing metadata"):
        fid = photo["drive_file_id"]
        limiter.wait()

        try:
            meta = drive.get_file_metadata(fid)
        except requests.HTTPError as e:
            log.warning("  Drive API error for %s: %s", fid, e)
            continue

        if meta is None or meta.get("trashed"):
            log.warning("  Missing/trashed in Drive: %s (%s)", photo["filename"], fid)
            missing += 1
            continue

        current_name = meta.get("name", "")
        parents = meta.get("parents", [])
        current_folder = folder_id_to_name.get(parents[0], "") if parents else ""

        stored_name = photo.get("filename", "")
        stored_folder = photo.get("folder", "")

        changes: dict[str, str] = {}
        if current_name and current_name != stored_name:
            changes["filename"] = current_name
        if current_folder != stored_folder:
            changes["folder"] = current_folder

        if changes:
            log.info(
                "  STALE: %s → %s (folder: %s → %s)",
                stored_name,
                changes.get("filename", stored_name),
                stored_folder or "(root)",
                changes.get("folder", stored_folder) or "(root)",
            )
            # Reset status so phase_describe re-processes with updated filename/folder
            changes["status"] = "pending"
            # Update photos row
            store.update_photo_metadata(fid, changes)
            # Null out description embedding (re-embeds with correct filename/folder)
            store.null_description_embedding(fid)
            # Update face_embeddings rows too
            store.update_face_embedding_metadata(fid, changes)
            updated += 1

    log.info("Sync complete: %d updated, %d missing/trashed", updated, missing)
    return updated


def phase_scan(drive: DriveClient, store: SupabaseStore, config: Config, folder_filter: str | None) -> int:
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
    log.info("─── PHASE 2: DESCRIBE ───")
    if not _check_embedding_column(store):
        return 0
    photos = store.get_photos_by_status(["pending"])
    if folder_filter:
        photos = [p for p in photos if p["folder"] == folder_filter]

    if not photos:
        log.info("No photos to describe")
        return 0

    log.info("%d photos to process", len(photos))
    errors = []
    processed = 0

    for i in range(0, len(photos), batch_size):
        batch = photos[i : i + batch_size]
        batch_described = []

        for photo in tqdm(batch, desc=f"Describe batch {i // batch_size + 1}"):
            fid = photo["drive_file_id"]
            try:
                img = drive.download_media_base64(fid)
                if not img:
                    log.warning("  Could not download %s", photo['filename'])
                    store.update_photo_metadata(fid, {"status": "error", "error_message": "Download failed"})
                    errors.append(photo["filename"])
                    continue

                b64, mime = img
                result = gemini.analyze_photo(b64, mime)
                store.update_photo_metadata(fid, {
                    "visible_text": result["visible_text"],
                    "people_descriptions": result["people_descriptions"],
                    "scene_description": result["scene_description"],
                    "face_count": result["face_count"],
                    "status": "completed",
                    "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "error_message": None,
                })
                batch_described.append({**photo, **result})
                processed += 1
            except KeyboardInterrupt:
                log.info("Interrupted — saving progress")
                break
            except (IOError, ValueError, RuntimeError) as e:
                log.error("  Failed %s: %s", photo['filename'], e)
                store.update_photo_metadata(fid, {"status": "error", "error_message": str(e)[:500]})
                errors.append(photo["filename"])

        # Generate text embeddings for this batch
        if batch_described:
            _embed_descriptions(gemini, store, batch_described)

    if errors:
        error_str = ', '.join(errors[:10]) + ('...' if len(errors) > 10 else '')
        log.warning("%d errors: %s", len(errors), error_str)
    log.info("Describe complete: %d photos processed", processed)
    return processed


def phase_embed_only(gemini: GeminiClient, store: SupabaseStore, folder_filter: str | None) -> int:
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
        
        # Save embeddings in sub-batches for better performance and error recovery
        batch_size = 100
        total_saved = 0
        for i in range(0, len(file_ids), batch_size):
            batch_end = min(i + batch_size, len(file_ids))
            batch_updates = list(zip(file_ids[i:batch_end], embeddings[i:batch_end]))
            saved = store.update_description_embeddings_batch(batch_updates)
            total_saved += saved
            if saved < batch_size and batch_end < len(file_ids):
                log.warning("Partial batch save: expected %d, saved %d", batch_size, saved)
        
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
    log.info("─── PHASE 3: FACE EMBED ───")
    if not face_api.health_check():
        log.error("Face API at %s is not reachable. Use --skip-face-embed or start the service.", face_api.base_url)
        return 0

    all_photos = store.get_photos_by_status(["completed"])
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
        try:
            img = drive.download_media_base64(fid)
            if not img:
                log.warning("  Could not download %s", photo['filename'])
                errors.append(photo["filename"])
                continue

            b64, mime = img
            if mime.startswith('video/'):
                log.info("  Skipping video %s for face embedding", photo['filename'])
                continue

            faces = face_api.get_embeddings(b64)
            for face in faces:
                bbox = face.get("bbox", [0, 0, 0, 0])
                store.upsert_face_embedding({
                    "drive_file_id": fid,
                    "filename": photo["filename"],
                    "folder": photo["folder"],
                    "face_index": face["index"],
                    "embedding": face["embedding"],
                    "bbox_x1": bbox[0] if len(bbox) > 0 else 0,
                    "bbox_y1": bbox[1] if len(bbox) > 1 else 0,
                    "bbox_x2": bbox[2] if len(bbox) > 2 else 0,
                    "bbox_y2": bbox[3] if len(bbox) > 3 else 0,
                })
            processed += 1
            time.sleep(0.5)  # Don't overwhelm single-worker Flask
        except KeyboardInterrupt:
            log.info("Interrupted — saving progress")
            break
        except (IOError, ValueError, RuntimeError) as e:
            log.error("  Failed %s: %s", photo['filename'], e)
            errors.append(photo["filename"])

    if errors:
        error_str = ', '.join(errors[:10]) + ('...' if len(errors) > 10 else '')
        log.warning("%d errors: %s", len(errors), error_str)
    log.info("Face embed complete: %d photos processed", processed)
    return processed


# ── CLI ────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="EventLens Photo Processing Pipeline")

    phase = p.add_argument_group("Phase control")
    phase.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    phase.add_argument("--skip-describe", action="store_true", help="Skip Gemini description phase")
    phase.add_argument("--skip-face-embed", action="store_true", help="Skip InsightFace phase")
    phase.add_argument("--only-scan", action="store_true", help="Run only scan phase")
    phase.add_argument("--only-describe", action="store_true", help="Run only describe + text embedding phase")
    phase.add_argument("--only-embeddings", action="store_true", help="Run only text embedding sub-phase")
    phase.add_argument("--only-face-embed", action="store_true", help="Run only face embedding phase")
    phase.add_argument("--only-sync", action="store_true", help="Detect renames/moves in Drive and update stale metadata")

    proc = p.add_argument_group("Processing options")
    proc.add_argument("--retry-errors", action="store_true", help="Re-process photos with error status")
    proc.add_argument("--batch-size", type=int, default=50, help="Photos per Gemini batch (default: 50)")
    proc.add_argument("--folder", type=str, help="Process only a specific subfolder name")
    proc.add_argument("--gemini-rpm", type=int, default=30, help="Gemini requests per minute (default: 30)")

    conf = p.add_argument_group("Configuration")
    conf.add_argument("--env-file", type=str, help="Path to env file (default: .env.local)")
    conf.add_argument("--face-api-url", type=str, help="Override FACE_API_URL")

    p.add_argument("--verbose", action="store_true", help="Debug logging")
    return p.parse_args()


def main():
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
    only_flags = [args.only_scan, args.only_describe, args.only_embeddings, args.only_face_embed, args.only_sync]
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
    if args.dry_run:
        log.info("[DRY RUN MODE]")

    results = {}

    try:
        if "sync" in phases:
            results["sync"] = phase_sync(drive, store, config, args.folder)

        if "scan" in phases:
            results["scan"] = phase_scan(drive, store, config, args.folder)

        if "describe" in phases:
            if not gemini:
                log.error("Gemini API key required for describe phase")
            else:
                results["describe"] = phase_describe(
                    drive, gemini, store, args.batch_size, args.folder
                )

        if "embeddings" in phases:
            if not gemini:
                log.error("Gemini API key required for embeddings phase")
            else:
                results["embeddings"] = phase_embed_only(gemini, store, args.folder)

        if "face_embed" in phases:
            if not face_api:
                log.error("FACE_API_URL required for face embed phase. Pass --face-api-url or set in env.")
            else:
                results["face_embed"] = phase_face_embed(drive, face_api, store, args.folder)

    except KeyboardInterrupt:
        log.info("\nInterrupted by user")

    # Summary
    log.info("─── SUMMARY ───")
    for phase_name, count in results.items():
        log.info("  %s: %d", phase_name, count)


if __name__ == "__main__":
    main()
