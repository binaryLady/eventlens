# Feature: Perceptual Hash De-duplication

## Context

EventLens is a Next.js 15 / React 19 event photography app deployed on Vercel. Photos are stored on Google Drive and indexed in Supabase PostgreSQL (with pgvector). The processing pipeline (`scripts/process_photos.py`) already scans Drive, calls Gemini Vision for metadata, generates 768-dim description embeddings, and runs InsightFace for 512-dim face embeddings. The admin dashboard (`/admin`) shows pipeline status.

Event photographers shoot bursts — the same moment captured 5-15 times. Re-uploads also happen when multiple organizers share overlapping folders. The gallery currently shows all of these redundant images.

## Goal

Add perceptual hashing (dHash, 64-bit) to detect near-duplicate and exact-duplicate photos. Surface duplicate clusters in the admin dashboard for review. Let admins mark duplicates as hidden (soft-delete) so they don't pollute the gallery or search results.

## Technical Approach

- **dHash (difference hash)**: Resize image to 9×8 grayscale, compare adjacent horizontal pixels → 64 bits. Hamming distance ≤ 10 = near-duplicate. This catches burst shots, re-uploads, minor crops, and JPEG re-compressions.
- Store the hash as a `bigint` column in the `photos` table.
- Use a Supabase RPC function to find clusters (self-join on Hamming distance).
- Compute hashes in the Python processing pipeline, alongside existing Gemini + face-embed phases.

## Commit Plan (molecular commits)

### Commit 1: Add phash column and RPC function

**Files:**
- `supabase/migrations/006_phash.sql`

**Changes:**
```sql
-- Add perceptual hash column
ALTER TABLE photos ADD COLUMN IF NOT EXISTS phash bigint;
CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos (phash) WHERE phash IS NOT NULL;

-- RPC: find duplicate clusters by Hamming distance
CREATE OR REPLACE FUNCTION find_duplicate_clusters(
  hamming_threshold int DEFAULT 10
)
RETURNS TABLE (
  group_id bigint,
  photo_id uuid,
  drive_file_id text,
  filename text,
  folder text,
  phash bigint,
  hamming_distance int
)
LANGUAGE sql AS $$
  WITH pairs AS (
    SELECT
      a.id AS id_a,
      b.id AS id_b,
      a.phash AS phash_a,
      b.phash AS phash_b,
      a.drive_file_id AS drive_file_id_a,
      a.filename AS filename_a,
      a.folder AS folder_a,
      b.drive_file_id AS drive_file_id_b,
      b.filename AS filename_b,
      b.folder AS folder_b,
      bit_count((a.phash # b.phash)::bit(64))::int AS dist
    FROM photos a
    JOIN photos b ON a.id < b.id
    WHERE a.phash IS NOT NULL
      AND b.phash IS NOT NULL
      AND a.status = 'completed'
      AND b.status = 'completed'
      AND bit_count((a.phash # b.phash)::bit(64))::int <= hamming_threshold
  )
  SELECT
    DENSE_RANK() OVER (ORDER BY LEAST(id_a, id_b)) AS group_id,
    id_a AS photo_id,
    drive_file_id_a AS drive_file_id,
    filename_a AS filename,
    folder_a AS folder,
    phash_a AS phash,
    dist AS hamming_distance
  FROM pairs
  UNION ALL
  SELECT
    DENSE_RANK() OVER (ORDER BY LEAST(id_a, id_b)) AS group_id,
    id_b AS photo_id,
    drive_file_id_b AS drive_file_id,
    filename_b AS filename,
    folder_b AS folder,
    phash_b AS phash,
    dist AS hamming_distance
  FROM pairs
  ORDER BY group_id, hamming_distance;
$$;
```

**Commit message:** `feat(db): add phash column and duplicate cluster RPC`

---

### Commit 2: Compute dHash in the Python processing pipeline

**Files:**
- `scripts/process_photos.py`

**Changes:**
- Add a new `dhash()` function that takes base64 image data → returns a 64-bit integer. Use Pillow (already available via the Gemini/face pipeline deps): resize to 9×8 grayscale, compute horizontal gradient, pack into int.
- Add a new pipeline phase `"phash"` that runs after `"scan"` (it only needs the raw image bytes, not Gemini output). For each photo missing a phash, download the thumbnail, compute dHash, update the `phash` column in Supabase.
- Integrate the phase into the existing `argparse` choices and the phase runner.
- Add a `SupabaseStore.update_phash(drive_file_id, phash_value)` method.

**Commit message:** `feat(pipeline): compute dHash perceptual hashes for all photos`

---

### Commit 3: Admin API endpoint for duplicate clusters

**Files:**
- `src/app/api/admin/duplicates/route.ts`

**Changes:**
- `GET /api/admin/duplicates` — calls `find_duplicate_clusters` RPC, groups results by `group_id`, returns JSON array of clusters. Each cluster includes the photo records and thumbnail URLs. Requires admin auth (same pattern as other `/api/admin/*` routes).
- Accept optional query param `?threshold=10` to control Hamming distance.

**Commit message:** `feat(api): add admin endpoint for duplicate photo clusters`

---

### Commit 4: Admin dashboard duplicate review UI

**Files:**
- `src/app/admin/page.tsx` (add a new tab/section)
- OR `src/app/admin/duplicates/page.tsx` (if admin uses sub-routes)

**Changes:**
- Add a "Duplicates" section to the admin dashboard.
- Fetch from `/api/admin/duplicates` on mount.
- Display each cluster as a horizontal strip of thumbnails with Hamming distance labels.
- Each photo in a cluster gets a "Hide" button that sets a `hidden` boolean column on the `photos` table.
- Show total duplicate count and space savings estimate.
- Match the existing retro terminal UI theme (`var(--el-green)`, `var(--el-magenta)`, mono font, etc.).

**Commit message:** `feat(admin): duplicate cluster review UI with hide action`

---

### Commit 5: Filter hidden photos from gallery and search

**Files:**
- `src/app/api/photos/route.ts`
- `supabase/migrations/006_phash.sql` (add `hidden` column in same migration or new 007)
- Any RPC functions that query `photos` (`search_photos`, `search_photos_semantic`)

**Changes:**
- Add `hidden boolean DEFAULT false` to `photos` table.
- Add `WHERE hidden = false` to the photos API query and all search RPC functions.
- Add `POST /api/admin/photos/hide` endpoint that accepts `{ ids: string[] }` and sets `hidden = true`.

**Commit message:** `feat: filter hidden/duplicate photos from gallery and search`

---

## Notes

- dHash is deterministic and stateless — safe to re-run on the full corpus.
- The self-join RPC is O(n²) but fine for <50k photos. For larger datasets, switch to a locality-sensitive hashing approach or pre-bucket by phash prefix.
- Pillow is the only new dependency (likely already installed for InsightFace env).
- No Gemini API calls needed — this is purely pixel math + SQL.
