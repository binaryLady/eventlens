# EventLens

AI-powered event photo gallery. Point it at a Google Drive folder, run the processing pipeline, and give your attendees a searchable gallery with face matching, semantic search, and batch downloads.

Built with Next.js 15, React 19, Supabase (pgvector), Gemini AI, and InsightFace.

---

## What It Does

EventLens turns a Google Drive folder of event photos into a fully interactive gallery where attendees can find their own photos by uploading a selfie, searching natural language descriptions, or browsing by folder and tag. Organizers get an admin dashboard to run AI processing, monitor pipeline status, and manage content.

### Attendee Features

- **Face matching** — Upload a selfie to find every photo you appear in. Uses InsightFace 512-dim face embeddings with pgvector cosine similarity, tiered by confidence.
- **Semantic search** — Natural language queries like "people near the stage" or "outdoor group photo." Powered by Gemini 768-dim text embeddings with vector similarity search.
- **Text search** — Search visible text (banners, badges, slides), people descriptions, scene descriptions, filenames, and folders. Full-text + trigram matching with ranked results.
- **Browse by folder** — Filter tabs for each Drive subfolder (day, session, photographer, etc.) with album preview cards on the home view.
- **Auto-tags** — AI-generated tags per photo (e.g. "keynote," "networking," "outdoor") with tag-based filtering.
- **Lightbox viewer** — Full-resolution photos with metadata panel, keyboard/swipe navigation, direct Drive link, and download button.
- **Batch download** — Select multiple photos and download as ZIP (up to 50 at once).
- **Collage maker** — Select photos and generate a collage in configurable aspect ratios (1:1, 4:3, 16:9, story).
- **Video playback** — Stream event videos directly from Drive with range request proxy support.
- **Activity ticker** — Live feed showing recent face match activity across the gallery.
- **Progressive rendering** — IntersectionObserver-based lazy rendering in batches of 40 for smooth scrolling through large galleries.
- **Password-protected access** — Simple password gate for private events.

### Organizer Features

- **Admin dashboard** (`/admin`) — Pipeline status, folder breakdown, error logs, duplicate detection, and content moderation (hide photos).
- **Processing pipeline** — Six-phase AI pipeline running as native TypeScript on Vercel serverless:
  - **Sync** — Reconcile Drive ↔ Supabase (detect renames, moves, deletions)
  - **Scan** — Discover new photos from Drive folders
  - **Describe** — Gemini Vision analysis: visible text, people descriptions, scene description, face count, auto-tags
  - **Embeddings** — Generate 768-dim text embeddings for semantic search (batch of 100 via Gemini)
  - **Face embed** — 512-dim face embeddings via external InsightFace microservice
  - **Phash** — 64-bit perceptual dHash for duplicate detection
- **Error retry** — Re-process failed photos without redoing successful ones.
- **Duplicate detection** — Find near-duplicate photos using Hamming distance on perceptual hashes.
- **Auto-tagging** — Batch-apply AI-generated tags to all photos.

---

## Design Decisions

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for a full RFC-style design document covering:

- Why Google Drive is the storage layer (not S3, not a database)
- Why pgvector over a dedicated vector database (Pinecone, Weaviate)
- Why face and text embeddings use separate vector spaces
- How the pipeline handles Vercel's 300s serverless timeout
- How hybrid search merges vector, full-text, and trigram results
- Tradeoffs acknowledged and what we'd improve

---

## Development Process

EventLens was built at the MIT HardMode hackathon in March 2026 using AI pair programming. The development workflow:

1. **Prototype fast** — get features working with AI-assisted code generation
2. **Verify UX** — test interactions, iterate on behavior
3. **Decompose** — identify extraction boundaries, split into hooks and components
4. **Document decisions** — capture the "why" behind architectural choices

The architect's role in AI-assisted development is knowing *where to cut* — which abstractions reflect real domain boundaries vs. arbitrary file splits. The 8 custom hooks and 15+ gallery components emerged from this process, not from upfront design.

---

## Architecture

```
Google Drive (photos + videos in folders)
       │
       ▼
Processing Pipeline (TypeScript, Vercel serverless, 300s max)
  ├── Gemini 2.5 Flash Lite → scene/text/people analysis + auto-tags
  ├── Gemini Embedding (gemini-embedding-001) → 768-dim description vectors
  ├── InsightFace (buffalo_l via Flask service) → 512-dim face vectors
  └── Sharp → 64-bit dHash perceptual hashes
       │
       ▼
Supabase (PostgreSQL + pgvector)
  ├── photos table — metadata, description embeddings, tsvector, phash
  ├── face_embeddings table — face vectors + bounding boxes
  ├── match_sessions table — face match analytics
  └── RPC functions — match_faces, search_photos, search_photos_semantic
       │
       ▼
Next.js 15 App (Vercel)
  ├── Gallery — search, browse, match, download, collage
  ├── Admin — pipeline control, status, moderation
  └── API routes — photos, search, match, video proxy, ZIP, auth, admin
```

---

## Setup

### Prerequisites

- Node.js 18+
- Google Cloud project with **Drive API** enabled + API key
- Google Drive folder with event photos (shared as "Anyone with the link can view")
- Supabase project with pgvector extension enabled
- Gemini API key (from [aistudio.google.com](https://aistudio.google.com))
- (Optional) InsightFace microservice deployed for face matching

### 1. Clone and install

```bash
git clone <repo-url>
cd eventlens
npm install
```

### 2. Set up Supabase

Create a Supabase project, then run the 12 migrations in order via the SQL Editor:

```
supabase/migrations/001_match_faces.sql
supabase/migrations/002_search_photos.sql
supabase/migrations/003_description_embeddings.sql
supabase/migrations/004_match_sessions.sql
supabase/migrations/005_add_face_embedding_unique_constraint.sql
supabase/migrations/006_add_face_embedding_hnsw_index.sql
supabase/migrations/007_match_session_analytics.sql
supabase/migrations/008_drive_file_id_canonical.sql
supabase/migrations/009_sentinel_face_embedding_guard.sql
supabase/migrations/010_phash_dedup.sql
supabase/migrations/011_auto_tags.sql
supabase/migrations/012_allow_null_face_embedding.sql
```

These create the `photos` and `face_embeddings` tables, pgvector indexes (HNSW for face embeddings), full-text search with tsvector, RPC functions for similarity search, and match session analytics.

### 3. Deploy the face-api service (optional)

The InsightFace microservice lives in `services/face-api/`. It's a Flask app that accepts base64 images and returns face embeddings + bounding boxes. Deploy to Railway, Render, or Fly.io:

```bash
cd services/face-api
docker build -t face-api .
# Deploy to your platform of choice
```

The service uses InsightFace's `buffalo_l` model (512-dim embeddings). It needs ~2GB RAM and takes 30-60s to cold start while downloading the model.

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | Yes | Google Cloud API key with Drive API enabled |
| `GOOGLE_DRIVE_FOLDER_ID` | Yes | Root Drive folder ID (from the folder URL) |
| `GEMINI_API_KEY` | Yes | Gemini API key for vision analysis and embeddings |
| `APP_PASSWORD` | Yes | Password attendees enter to access the gallery |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ADMIN_API_SECRET` | Yes | Bearer token for admin API endpoints |
| `FACE_API_URL` | No | URL of deployed InsightFace microservice |
| `FACE_API_SECRET` | No | Bearer token for face-api authentication |
| `NEXT_PUBLIC_EVENT_NAME` | No | Event title displayed in the gallery header |
| `NEXT_PUBLIC_EVENT_TAGLINE` | No | Subtitle below the event name |
| `NEXT_PUBLIC_PRIMARY_COLOR` | No | Primary theme color hex (default: `#3b82f6`) |
| `NEXT_PUBLIC_ACCENT_COLOR` | No | Accent theme color hex (default: `#f59e0b`) |

### 5. Process photos

Start the dev server, then trigger the pipeline from the admin dashboard or via API:

```bash
npm run dev
# Visit /admin and click "Full Pipeline"
```

Or call the API directly:

```bash
# Run all phases sequentially (re-call until done: true)
curl -X POST http://localhost:3000/api/admin/pipeline \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phase": "full"}'

# Run a specific phase
curl -X POST http://localhost:3000/api/admin/pipeline \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phase": "describe"}'

# Retry failed photos
curl -X POST http://localhost:3000/api/admin/pipeline \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phase": "describe", "retryErrors": true}'
```

The pipeline runs within Vercel's 300s function timeout. Long phases (describe, face-embed) process photos in a loop with a wall-clock guard and return `{ processed, remaining, done }`. Call repeatedly until `done: true`.

### 6. Deploy

```bash
# Vercel (recommended)
vercel --prod

# Or build locally
npm run build && npm start
```

Set all environment variables in the Vercel dashboard. The pipeline route is configured with `maxDuration = 300` (requires Vercel Pro plan for the full 300s; Hobby plan caps at 60s).

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Gallery entry (Suspense + ErrorBoundary)
│   ├── login/page.tsx                  # Password login page
│   ├── admin/page.tsx                  # Admin dashboard
│   ├── layout.tsx                      # Root layout with fonts + theme
│   ├── globals.css                     # Tailwind + CSS custom properties
│   └── api/
│       ├── photos/route.ts             # Photo list with pagination
│       ├── search/route.ts             # Semantic + full-text hybrid search
│       ├── match/route.ts              # Face matching via pgvector
│       ├── stats/route.ts              # Gallery analytics + activity feed
│       ├── video/route.ts              # Drive video streaming proxy
│       ├── download-zip/route.ts       # Batch ZIP export
│       ├── collage/route.ts            # Server-side collage generation
│       ├── auth/
│       │   ├── login/route.ts          # Cookie-based login
│       │   └── logout/route.ts         # Cookie clear
│       └── admin/
│           ├── pipeline/route.ts       # Pipeline orchestrator (6 phases)
│           ├── status/route.ts         # Pipeline status + folder stats
│           ├── scan/route.ts           # Quick Drive scan
│           ├── autotag/route.ts        # Batch auto-tagging
│           ├── duplicates/route.ts     # Phash duplicate detection
│           └── photos/hide/route.ts    # Content moderation
│
├── components/
│   ├── gallery/
│   │   ├── PhotoGallery.tsx            # Main orchestrator (~340 lines)
│   │   ├── GalleryHeader.tsx           # Search bar + title + actions
│   │   ├── FolderTabs.tsx              # Folder filter pills
│   │   ├── TagTabs.tsx                 # Tag filter pills
│   │   ├── FilterSortBar.tsx           # Filter trigger + active badges
│   │   ├── FilterSortSheet.tsx         # Full filter/sort panel
│   │   ├── PhotoGrid.tsx              # CSS grid + photo cards
│   │   ├── PhotoCard.tsx               # Individual photo card
│   │   ├── AlbumGrid.tsx              # Folder preview cards
│   │   ├── HeroSection.tsx            # Featured photo display
│   │   ├── SearchStatus.tsx           # Search result info bar
│   │   ├── RecommendationsBar.tsx     # AI search suggestions
│   │   ├── EmptyState.tsx             # Zero results messaging
│   │   ├── TerminalLoader.tsx         # Boot animation
│   │   └── GridSkeleton.tsx           # Loading skeleton
│   ├── ActivityTicker.tsx              # Live match activity feed
│   ├── CollagePreview.tsx              # Collage result viewer
│   ├── CollageRatioModal.tsx           # Aspect ratio picker
│   ├── ErrorBoundary.tsx               # React error boundary
│   ├── FloatingActionBar.tsx           # Selection toolbar
│   ├── Footer.tsx                      # Gallery footer
│   ├── Lightbox.tsx                    # Full-screen photo viewer
│   ├── PhotoUpload.tsx                 # Selfie upload for face matching
│   └── Toast.tsx                       # Toast notifications
│
├── hooks/
│   ├── usePhotos.ts                    # Photo fetching + polling
│   ├── useSearch.ts                    # Search input + debounce + server search
│   ├── useFilters.ts                   # Folder/tag/type/sort filtering
│   ├── useSelection.ts                # Multi-select mode
│   ├── useCollage.ts                   # Collage creation flow
│   ├── useStats.ts                     # Stats polling
│   ├── useProgressiveRender.ts         # IntersectionObserver lazy rendering
│   └── useUrlSync.ts                   # URL query param sync
│
├── lib/
│   ├── photos.ts                       # Photo fetching + Supabase metadata merge
│   ├── drive.ts                        # Google Drive API client
│   ├── gemini.ts                       # Gemini API (search-time)
│   ├── supabase.ts                     # Supabase client setup
│   ├── auth.ts                         # Auth utilities
│   ├── config.ts                       # Environment config
│   ├── types.ts                        # TypeScript interfaces
│   ├── utils.ts                        # Shared utilities
│   └── pipeline/
│       ├── rate-limiter.ts             # Sliding-window rate limiter
│       ├── retry.ts                    # Exponential backoff retry
│       ├── drive-client.ts             # Drive ops for pipeline
│       ├── gemini-client.ts            # Gemini vision + batch embeddings
│       ├── face-api-client.ts          # InsightFace API client
│       ├── supabase-store.ts           # Pipeline Supabase CRUD
│       ├── phash.ts                    # dHash perceptual hashing (sharp)
│       ├── types.ts                    # Pipeline-specific types
│       └── phases/
│           ├── sync.ts                 # Drive ↔ Supabase reconciliation
│           ├── scan.ts                 # New photo discovery
│           ├── describe.ts             # Gemini vision analysis
│           ├── embed.ts                # Embedding backfill
│           ├── face-embed.ts           # InsightFace face embeddings
│           └── phash.ts                # Perceptual hash generation
│
├── middleware.ts                        # Auth middleware
│
services/face-api/                       # InsightFace microservice (Flask + Docker)
│   ├── app.py
│   ├── Dockerfile
│   └── requirements.txt
│
supabase/migrations/                     # 12 SQL migrations
```

---

## Tech Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **Database**: Supabase (PostgreSQL + pgvector for vector similarity search)
- **AI — Vision**: Gemini 2.5 Flash Lite (structured photo analysis)
- **AI — Embeddings**: Gemini Embedding 001 (768-dim text embeddings, batch API)
- **AI — Face**: InsightFace buffalo_l via Flask microservice (512-dim face embeddings)
- **Image Processing**: Sharp (perceptual hashing, collage generation)
- **Storage**: Google Drive REST API v3 (CDN thumbnails via `lh3.googleusercontent.com`)
- **Deployment**: Vercel (app + serverless pipeline), Railway/Render/Fly.io (face-api)

---

## API Reference

All endpoints except auth require the gallery password cookie. Admin endpoints require `Authorization: Bearer <ADMIN_API_SECRET>`.

| Endpoint | Method | Description |
|---|---|---|
| `/api/photos` | GET | Photo list with `limit`/`offset` pagination |
| `/api/search?q=` | GET | Hybrid semantic + full-text search |
| `/api/match` | POST | Face matching (accepts base64 selfie) |
| `/api/stats` | GET | Gallery analytics, recent activity, hot photos |
| `/api/video?id=` | GET | Drive video streaming proxy with range support |
| `/api/download-zip` | POST | Batch ZIP download (up to 50 photos) |
| `/api/collage` | POST | Generate photo collage with configurable ratio |
| `/api/auth/login` | POST | Password login, sets auth cookie |
| `/api/auth/logout` | POST | Clears auth cookie |
| `/api/admin/pipeline` | POST | Run pipeline phase (`sync`, `scan`, `describe`, `embeddings`, `face-embed`, `phash`, `full`) |
| `/api/admin/status` | GET | Pipeline status + folder breakdown |
| `/api/admin/scan` | POST | Quick Drive folder scan |
| `/api/admin/autotag` | POST | Batch auto-tag all photos |
| `/api/admin/duplicates` | GET | Find duplicate photos by phash |
| `/api/admin/photos/hide` | POST | Hide/unhide photos |

---

## License

MIT
