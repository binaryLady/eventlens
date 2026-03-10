# EventLens

AI-powered event photo reconnaissance system. Upload event photos to Google Drive, let AI analyze them, and give attendees a fast gallery with face matching, semantic search, and text search.

---

## How It Works

EventLens combines Google Drive for storage, Supabase for metadata and vector search, and multiple AI models for photo analysis:

1. **Google Drive** — Event photos organized in folders (by day, session, photographer, etc.)
2. **Processing pipeline** — A Python script scans Drive, uses Gemini Vision to describe each photo, generates text embeddings (Gemini) and face embeddings (InsightFace), and stores everything in Supabase
3. **Next.js app** — A searchable gallery with face matching, semantic search, full-text search, and batch downloads

---

## Features

### For attendees

- **Face matching** — Upload a selfie to find photos you're in. Uses InsightFace 512-dim face embeddings with pgvector cosine similarity search
- **Semantic search** — Natural language queries like "people near the stage" or "outdoor group photo". Uses Gemini 768-dim description embeddings
- **Text search** — Search visible text (banners, badges, slides), people descriptions, scene descriptions, filenames, and folders. Full-text + trigram matching
- **Browse by folder** — Filter chips for each Drive subfolder
- **Lightbox viewer** — Full-resolution photos with metadata panel, keyboard/touch navigation, Drive link, and download
- **Batch download** — Select multiple photos and download as ZIP (up to 50)
- **Video playback** — Stream event videos directly from Drive with range request support
- **Password-protected access** — Simple password gate for private events

### For organizers

- **Admin dashboard** — Pipeline status, folder breakdown, error logs, activity feed
- **Processing pipeline** — Orchestrate photo scanning and AI analysis in phases:
  - **Scan** — Discover new files from Google Drive folders
  - **Describe** — Generate AI metadata with Gemini Vision (visible text, people descriptions, scene description, face count)
  - **Embeddings** — Create 768-dim text embeddings for semantic search
  - **Face embed** — Generate 512-dim face embeddings via InsightFace microservice
- **Error retry** — Re-process failed photos without redoing everything

---

## Architecture

```
Google Drive (photo/video files)
       │
       ▼
Processing Pipeline (Python script or Admin API)
  ├── Gemini Vision → text, people, scene analysis
  ├── Gemini Embedding → 768-dim description vectors
  └── InsightFace (face-api service) → 512-dim face vectors
       │
       ▼
Supabase (PostgreSQL + pgvector)
  ├── photos table (metadata, description embeddings, search vectors)
  ├── face_embeddings table (face vectors, bounding boxes)
  ├── match_sessions table (analytics)
  └── RPC functions (match_faces, search_photos, search_photos_semantic)
       │
       ▼
Next.js App (Vercel)
  ├── /api/photos      → photo list from Supabase
  ├── /api/match       → face embedding → pgvector similarity
  ├── /api/search      → semantic + text hybrid search
  ├── /api/video       → Drive video streaming proxy
  ├── /api/download-zip → batch ZIP export
  ├── /api/auth/*      → cookie-based login/logout
  └── /api/admin/*     → pipeline orchestration (protected)
       │
       ▼
Attendees (search + browse + match + download)
```

---

## Setup

### Prerequisites

- Google Cloud project with **Drive API** enabled and an API key
- Google Drive folder with event photos (shared as "Anyone with the link")
- Supabase project with pgvector extension
- Gemini API key (from aistudio.google.com)
- (Optional) Face-api microservice deployed for face matching

### 1. Set up Supabase

Create a Supabase project and run the migrations in order:

```bash
# In the Supabase SQL editor, run each file from:
supabase/migrations/001_match_faces.sql
supabase/migrations/002_search_photos.sql
supabase/migrations/003_description_embeddings.sql
supabase/migrations/004_match_sessions.sql
supabase/migrations/005_add_face_embedding_unique_constraint.sql
```

### 2. Deploy the face-api service (optional)

The face embedding microservice lives in `services/face-api/`. Deploy it to Railway, Render, or Fly.io:

```bash
cd services/face-api
docker build -t face-api .
# Deploy to your platform of choice
```

### 3. Set environment variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_SHEET_ID` | Yes | Google Sheet ID (legacy photo source, still used as fallback) |
| `GOOGLE_API_KEY` | Yes | Google Cloud API key with Drive API enabled |
| `GOOGLE_DRIVE_FOLDER_ID` | Yes | Root Drive folder ID for photo scanning |
| `GEMINI_API_KEY` | Yes | Gemini API key for vision analysis and embeddings |
| `APP_PASSWORD` | Yes | Password for attendee access |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `ADMIN_API_SECRET` | Yes | Bearer token for admin API endpoints |
| `FACE_API_URL` | No | URL to deployed face-api service |
| `FACE_API_SECRET` | No | Bearer token for face-api authentication |
| `NEXT_PUBLIC_EVENT_NAME` | No | Event title (default: "HARD MODE") |
| `NEXT_PUBLIC_EVENT_TAGLINE` | No | Subtitle (default: "PHOTO RECONNAISSANCE SYSTEM") |
| `NEXT_PUBLIC_PRIMARY_COLOR` | No | Primary color hex (default: `#00ff41`) |
| `NEXT_PUBLIC_ACCENT_COLOR` | No | Accent color hex (default: `#00ff41`) |

### 4. Process photos

Run the Python pipeline to scan Drive and generate AI metadata:

```bash
cd scripts
pip install -r requirements.txt
python process_photos.py --full  # scan + describe + embeddings
python process_photos.py --only-face-embed  # face embeddings (requires face-api service)
```

Or use the admin dashboard at `/admin` to trigger processing via the API.

### 5. Deploy

**Local:**

```bash
npm install
npm run build
npm start
```

**Vercel (recommended):**

```bash
vercel
vercel --prod
```

Set all environment variables in the Vercel dashboard.

---

## Project Structure

```
src/
  app/
    page.tsx                    # Main gallery
    login/page.tsx              # Auth page
    admin/page.tsx              # Admin dashboard
    api/
      photos/route.ts           # Photo list endpoint
      match/route.ts            # Face matching endpoint
      search/route.ts           # Semantic + text search
      video/route.ts            # Drive video proxy
      download-zip/route.ts     # Batch ZIP export
      auth/login/route.ts       # Login
      auth/logout/route.ts      # Logout
      admin/scan/route.ts       # Drive scanning
      admin/pipeline/route.ts   # Processing pipeline
      admin/status/route.ts     # Pipeline status
  components/
    PhotoUpload.tsx             # Selfie upload for face matching
    Lightbox.tsx                # Full-screen photo viewer
    FloatingActionBar.tsx       # Selection + download toolbar
  lib/
    supabase.ts                 # Supabase client + RPC calls
    gemini.ts                   # Gemini Vision API
    drive.ts                    # Google Drive API client
    photos.ts                   # Photo fetching logic
    auth.ts                     # Auth utilities
    config.ts                   # Environment config
    types.ts                    # TypeScript interfaces
  middleware.ts                 # Auth middleware

services/face-api/              # InsightFace microservice (Flask)
scripts/process_photos.py       # Python processing pipeline
supabase/migrations/            # Database schema
```

---

## Tech Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS (retro terminal aesthetic)
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: Gemini Vision (photo analysis), Gemini Embedding (semantic search), InsightFace (face matching)
- **Storage**: Google Drive (photos/videos)
- **Deployment**: Vercel (app), Railway/Render/Fly.io (face-api service)

---

## License

MIT
