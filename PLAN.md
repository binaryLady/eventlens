# EventLens — Status & Plan

## Completed

### Infrastructure

- [x] Supabase PostgreSQL with pgvector extension
- [x] `photos` table — metadata, description embeddings, search vectors, processing status
- [x] `face_embeddings` table — 512-dim InsightFace vectors with bounding boxes, HNSW index
- [x] `match_sessions` table — analytics for face match queries
- [x] RPC functions: `match_faces()`, `search_photos()`, `search_photos_semantic()`
- [x] Supabase migrations (5 migration files)

### Processing Pipeline

- [x] Python script (`scripts/process_photos.py`) with phased processing:
  - Scan: discover files from Google Drive
  - Describe: Gemini Vision analysis (visible text, people, scene, face count)
  - Embeddings: 768-dim Gemini text embeddings for semantic search
  - Face embed: 512-dim InsightFace embeddings via face-api service
- [x] Rate limiting, retry logic (tenacity), progress bars (tqdm)
- [x] Admin API endpoints for triggering pipeline phases from the dashboard
- [x] Admin dashboard UI with status, folder breakdown, error logs, activity feed

### Search

- [x] Face matching — selfie upload → InsightFace embedding → pgvector cosine similarity
- [x] Semantic search — query → Gemini embedding → pgvector cosine similarity on descriptions
- [x] Text search — full-text (tsvector) + trigram similarity on all text fields
- [x] Multi-tier search combining vector, text, and semantic results

### Face-API Microservice

- [x] Flask service (`services/face-api/`) using InsightFace
- [x] Dockerized for deployment on Railway/Render/Fly.io
- [x] `POST /embed` endpoint returning 512-dim face embeddings + bounding boxes

### Frontend

- [x] Photo gallery with folder filtering
- [x] Face matching UI (PhotoUpload component with camera capture)
- [x] Lightbox with metadata, keyboard/touch navigation
- [x] Batch selection + ZIP download (up to 50 files)
- [x] Video streaming proxy with range request support
- [x] Password authentication (cookie-based)
- [x] Retro terminal UI theme (configurable colors)

### API Endpoints

- [x] `GET /api/photos` — fetch photos from Supabase (Google Sheets fallback)
- [x] `POST /api/match` — face embedding search
- [x] `GET /api/search` — semantic + text hybrid search
- [x] `GET /api/video` — Drive video streaming proxy
- [x] `POST /api/download-zip` — batch ZIP export
- [x] `POST /api/auth/login` + `POST /api/auth/logout`
- [x] `POST /api/admin/scan` — Drive folder scanning
- [x] `POST /api/admin/pipeline` — processing pipeline orchestration
- [x] `GET /api/admin/status` — pipeline status dashboard data

---

## Current State

- Photos table is populated with AI-generated metadata
- Face embeddings table has vectors from InsightFace
- All search modes (face, semantic, text) are functional
- Admin pipeline can process new photos end-to-end
- App is deployed on Vercel
- Face-api service needs separate deployment (Railway/Render/Fly.io)

---

## Potential Next Steps

These are ideas for future improvement, not committed work:

### Polish

- [ ] Improve loading states and skeleton screens
- [ ] Better error messages for failed face matches (no face detected, etc.)
- [ ] Progress indicator for large ZIP downloads

### Search Quality

- [ ] Tune similarity thresholds (face: 0.68, semantic: 0.35) based on real usage
- [ ] Add search result scoring/ranking explanations
- [ ] Filter search results by folder

### Performance

- [ ] Paginate photo list (currently loads all photos)
- [ ] Lazy-load thumbnails with intersection observer
- [ ] Cache Supabase queries with Next.js ISR

### Admin

- [ ] Show processing progress in real-time (SSE or polling)
- [ ] Bulk re-process by folder
- [ ] Preview processed metadata before committing

### Analytics

- [ ] Dashboard for match_sessions data (popular searches, match rates)
- [ ] Export analytics as CSV

### Cleanup

- [ ] Remove Google Sheets fallback from `/api/photos` (fully migrated to Supabase)
- [ ] Remove legacy `GOOGLE_SHEET_ID` env var if Sheets fallback is dropped

### Vision AI Features (planned — see `.claude/prompts/` for full prompts)

- [ ] **Perceptual Hash De-duplication** → `.claude/prompts/DEDUP.md` (5 commits)
  - dHash column, duplicate cluster RPC, pipeline integration, admin review UI, hidden filter
  - Zero API cost — pure pixel math + SQL
- [ ] **Auto-Albums via Embedding Clustering** → `.claude/prompts/AUTOALBUMS.md` (5 commits)
  - k-means on existing 768-dim embeddings, Gemini names clusters, tag filter chips in gallery
  - ~5-10 Gemini calls total (one per cluster for naming)
- [ ] **Collage from Selection** → `.claude/prompts/COLLAGE.md` (5 commits)
  - Sharp server-side compositing, grid layout, FloatingActionBar button, preview modal, optional Gemini hero pick
  - Zero API cost for basic version; 1 call for hero mode
