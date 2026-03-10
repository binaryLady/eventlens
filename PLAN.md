# EventLens Finalization Plan

## Current State
- **Drive**: stores image files (source of truth)
- **Supabase `face_embeddings`**: 7k rows from Colab (InsightFace buffalo_l, 512-dim vectors). Possibly has duplicates.
- **Supabase `photos`**: empty table, never populated
- **`/api/photos`**: hits Drive API every request, returns empty metadata fields
- **`/api/match`**: uses Gemini Vision (slow, ignores the 7k embeddings entirely)
- **Admin system**: 3 API routes + UI page + cron job, never used

## Target State
- **`/api/photos`**: reads from Supabase `face_embeddings` (deduplicated by `drive_file_id`), uses Drive CDN for thumbnails
- **`/api/match`**: runs InsightFace ONNX model via `onnxruntime-node` on uploaded photo, queries pgvector for cosine similarity
- **Admin system**: removed entirely
- **Text search**: searches against `filename` and `folder` fields from `face_embeddings`

---

## Steps

### 1. Deduplicate `face_embeddings`
- Query Supabase to check for duplicate `(drive_file_id, face_index)` pairs
- Delete duplicates, keeping the most recent row per pair
- Can be done via SQL in Supabase dashboard or a one-off script

### 2. Create pgvector similarity function in Supabase
- Create a Postgres RPC function `match_faces(query_embedding vector(512), match_threshold float, match_count int)`
- Uses cosine similarity (`<=>` operator) against `face_embeddings.embedding`
- Returns matching rows with similarity score, grouped by `drive_file_id`

### 3. Rewire `/api/photos` to read from Supabase
- Query `face_embeddings` with `SELECT DISTINCT ON (drive_file_id)` to get unique photos
- Map to `PhotoRecord` format: derive `thumbnailUrl` and `downloadUrl` from `drive_file_id`
- Search filters against `filename` and `folder` (the metadata we have)
- Remove `fetchPhotosFromDriveFolder()`, `fetchPhotos()`, Google Sheet fallback

### 4. Add InsightFace ONNX runtime to Next.js
- Install `onnxruntime-node`
- Download InsightFace buffalo_l ONNX model files:
  - `det_10g.onnx` (~16MB) — face detection
  - `w600k_r50.onnx` (~166MB) — face recognition (512-dim embeddings)
- Store in `public/models/` or a separate directory
- Create `src/lib/insightface.ts` — loads models, detects faces, extracts embeddings
- **Risk**: Vercel serverless function size limit is 250MB. Models total ~182MB. May need to use Vercel Fluid Compute or store models externally and download at cold start.

### 5. Rewire `/api/match` to use pgvector
- Accept uploaded image (base64)
- Run InsightFace ONNX to extract 512-dim face embedding
- Call Supabase RPC `match_faces()` for cosine similarity search
- Return matched photos with confidence scores
- Remove Gemini visual matching, text-based attribute matching, thumbnail downloading

### 6. Remove admin system
- Delete `src/app/admin/page.tsx`
- Delete `src/app/api/admin/scan/route.ts`
- Delete `src/app/api/admin/index/route.ts`
- Delete `src/app/api/admin/status/route.ts`
- Remove `analyzeEventPhoto` from `src/lib/gemini.ts`
- Remove `adminSecret` from `src/lib/config.ts`
- Remove cron config and admin function config from `vercel.json`

### 7. Clean up dead code
- Remove `fetchPhotos()` (Google Sheet reader) from `src/lib/photos.ts`
- Remove `fetchPhotosFromDriveFolder()` — replaced by Supabase query
- Remove `fetchDriveFolders()` — folders come from Supabase `face_embeddings.folder`
- Remove Google Sheet config (`sheetId`) from `src/lib/config.ts`
- Keep `describePersonForMatching` and `verifyFaceMatches` in gemini.ts only if needed as fallback
- Remove `src/lib/supabase.ts` PhotoRow interface (photos table not used)

### 8. Update Colab notebook
- Add Gemini text analysis cell: for each photo, call Gemini to get `visible_text`, `people_descriptions`, `scene_description`
- Store in a new `photo_metadata` table or add columns to `face_embeddings`
- This enables richer text search in the future
- Add deduplication check before inserting embeddings

---

## Architecture After

```
┌──────────────────────────────────────────────────┐
│ Google Drive (image files)                       │
│  └── thumbnails via lh3.googleusercontent.com    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Google Colab (batch processing)                  │
│  └── InsightFace → face_embeddings → Supabase    │
│  └── (future) Gemini → text metadata → Supabase  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Supabase                                         │
│  ├── face_embeddings (7k rows, pgvector)         │
│  │   drive_file_id, filename, folder,            │
│  │   face_index, embedding(512), bbox            │
│  └── match_faces() RPC function                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Next.js App (Vercel)                             │
│  ├── /api/photos    → reads Supabase             │
│  ├── /api/match     → ONNX embedding → pgvector  │
│  ├── /api/download-zip → Drive download          │
│  └── /api/auth/*    → cookie login/logout        │
└──────────────────────────────────────────────────┘
```

## Open Questions
- Vercel 250MB limit vs ~182MB of ONNX models — may need Fluid Compute or external model hosting
- Do we want Gemini as a fallback if ONNX face detection finds no face in the uploaded photo?
- Text search: currently limited to filename+folder. Richer search needs Colab to generate text metadata.
