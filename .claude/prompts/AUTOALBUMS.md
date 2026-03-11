# Feature: Auto-Albums via Embedding Clustering

## Context

EventLens stores 768-dim Gemini description embeddings in the `photos.description_embedding` column (pgvector). Each photo also has `scene_description`, `people_descriptions`, `visible_text`, `face_count`, and `folder`. Currently the only organizational axis is the Drive folder name. Users want to browse by *what's happening* — "stage talks", "networking", "food", "group shots" — not by which camera/folder it came from.

## Goal

Cluster photos by semantic similarity of their description embeddings to automatically generate thematic albums (e.g., "Stage & Presentations", "Networking & Conversations", "Group Photos", "Food & Drinks"). Surface these as filter chips in the gallery UI alongside the existing folder filters. This uses only data that already exists — zero new API calls.

## Technical Approach

- **Offline batch job** (Python script): pull all 768-dim embeddings from Supabase, run k-means (or DBSCAN) clustering, use Gemini to name each cluster from the combined scene descriptions of its members (one cheap API call per cluster, ~5-8 clusters total).
- Store the assigned `auto_tag` on each photo row.
- Frontend reads `auto_tag` as a filterable dimension alongside `folder`.

## Commit Plan (molecular commits)

### Commit 1: Add auto_tag column to photos table

**Files:**
- `supabase/migrations/007_auto_tags.sql`

**Changes:**
```sql
ALTER TABLE photos ADD COLUMN IF NOT EXISTS auto_tag text;
CREATE INDEX IF NOT EXISTS idx_photos_auto_tag ON photos (auto_tag) WHERE auto_tag IS NOT NULL;
```

Keep it simple — a single text tag per photo. No join table needed; events are bounded in size and a photo belongs to one primary theme.

**Commit message:** `feat(db): add auto_tag column for thematic album clustering`

---

### Commit 2: Python clustering script

**Files:**
- `scripts/auto_tag_photos.py`

**Changes:**
- New standalone script (not part of the main pipeline — run on-demand or after a full processing pass).
- Pulls all photos with non-null `description_embedding` from Supabase.
- Converts embeddings to numpy array.
- Runs **k-means** with k selected by silhouette score (try k=5 through k=12, pick best). Alternatively support a `--k` flag for manual override.
- For each cluster, gather the `scene_description` values, sample up to 20, and send to Gemini Flash with a prompt like:

```
These are descriptions of event photos in one group. Give this group a short, descriptive album name (2-4 words). Examples: "Stage & Keynotes", "Networking", "Food & Drinks", "Outdoor Activities", "Group Photos", "Expo Booths".

Descriptions:
{descriptions}

Respond with ONLY the album name, nothing else.
```

- Update each photo's `auto_tag` in Supabase.
- Print a summary: cluster name, photo count, sample filenames.
- Dependencies: `numpy`, `scikit-learn` (add to a `requirements-scripts.txt` or note in README). These are NOT needed by the Next.js app — only by the offline script.

**Commit message:** `feat(scripts): auto-tag photos by embedding clustering with Gemini naming`

---

### Commit 3: Return auto_tags in the photos API

**Files:**
- `src/app/api/photos/route.ts`
- `src/lib/types.ts`

**Changes:**
- Add `autoTag: string | null` to `PhotoRecord` type.
- Include `auto_tag` in the Supabase select query in `/api/photos`.
- Map it to `autoTag` in the response (matching existing camelCase convention).
- Include a new `tags: string[]` field in `PhotosResponse` (distinct non-null auto_tags, like the existing `folders` array).

**Commit message:** `feat(api): include auto_tag in photos response`

---

### Commit 4: Tag filter chips in the gallery UI

**Files:**
- `src/app/page.tsx`

**Changes:**
- Add a `activeTag` state (string | null) alongside the existing `activeFolder`.
- Render a row of tag filter chips below (or alongside) the folder filters. Style them identically but with a different accent color (e.g., `var(--el-amber)` or `var(--el-cyan)`) so users can distinguish folder vs. tag filters.
- When a tag chip is clicked, filter `filteredPhotos` to only photos with that `autoTag`.
- Tag and folder filters should be composable (AND logic): you can filter by folder "Day 1" AND tag "Stage & Keynotes".
- Show photo count per tag on the chip (e.g., `STAGE & KEYNOTES (42)`).
- Clear tag filter when "ALL" is clicked or when the tag chip is clicked again (toggle behavior).

**Commit message:** `feat(ui): add auto-tag filter chips to gallery`

---

### Commit 5: Admin trigger for re-clustering

**Files:**
- `src/app/api/admin/autotag/route.ts`

**Changes:**
- `POST /api/admin/autotag` — triggers the clustering job. Since the Python script is a separate process, this endpoint should either:
  - (a) Call a serverless function / background job that runs the script, OR
  - (b) For the MVP, simply document that the admin runs `python scripts/auto_tag_photos.py` manually after processing, and this endpoint returns the current tag distribution (`SELECT auto_tag, COUNT(*) FROM photos GROUP BY auto_tag`).
- Go with option (b) for now — the admin already runs the pipeline manually.

**Commit message:** `feat(api): admin endpoint for auto-tag distribution stats`

---

## Notes

- Total Gemini cost: ~5-10 API calls (one per cluster for naming). Effectively free.
- scikit-learn k-means on 5k vectors with 768 dims takes <2 seconds.
- If the event has very distinct sub-events (Day 1, Day 2, workshops), the clusters will naturally separate by content, not by time — which is the point.
- For a future iteration: allow admins to rename auto-generated album names, and pin/reorder them.
