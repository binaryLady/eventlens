# EventLens Architecture

> RFC-style design document for EventLens, an AI-powered event photo gallery.
> Built at MIT HardMode hackathon (March 2026). Next.js 15, React 19, Supabase + pgvector, Gemini AI, InsightFace.

## 1. Problem Statement

Events like hackathons, conferences, and sponsored meetups generate thousands of photos from multiple contributors — organizers, volunteers, professional photographers, attendees with phones. Google Drive is the natural aggregation point: it's free, everyone has access, and contributors can dump photos into shared folders without coordination.

The problem is what happens next. Three distinct stakeholders need to retrieve specific images from that undifferentiated mass, and each has a different retrieval pattern:

- **Organizers** need curated assets for social media, promotional materials, and post-event reporting. They're looking for specific scenes ("the keynote speaker on stage"), specific branding moments, or high-quality crowd shots. Without search, they scroll through hundreds of photos manually, often under deadline pressure.

- **Attendees** want photos of themselves, their teammates, and their projects. At a 500-person event with 2,000 photos, the odds of finding yourself by scrolling are low. Most attendees give up, and the photos go unused.

- **Sponsors** need visual proof of engagement for their stakeholders — branded moments, booth traffic, logo visibility. Justifying continued sponsorship depends on these assets, and sponsors rarely have time to dig through a Drive folder.

Manual tagging doesn't scale. An organizer would need to tag every face, every scene, every piece of visible text across thousands of images. Even with a volunteer team, this takes days and produces inconsistent results.

AI changes the economics of this problem in three ways:

1. **Ephemeral face matching.** An attendee uploads a selfie, which is embedded into a 512-dimensional vector space and compared against pre-computed face embeddings for every photo in the gallery. The selfie is never stored — the match happens in real time against the indexed embeddings. This turns "find photos of me" from an impossible task into a 30-second interaction.

2. **Semantic search over visual content.** Every photo is analyzed by a vision model that extracts scene descriptions, visible text (badges, banners, signage), and people descriptions. These are embedded into a 768-dimensional vector space, enabling natural language queries like "outdoor group photo" or "people near the demo booth." Combined with full-text and trigram search, this handles both semantic intent and exact-match queries.

3. **Processing at scale.** When an organizer adds 1,000 new photos to a Drive folder, the pipeline processes them through six phases — sync, scan, describe, embed, face-embed, and perceptual hash — with rate limiting, retry logic, and wall-clock guards that respect serverless execution limits. Perceptual hashing enables duplicate detection, giving admins tools to deduplicate and moderate content.

EventLens is the system that connects these capabilities: a deployable gallery that takes a Google Drive folder as input and produces a searchable, face-matchable, AI-tagged photo experience as output.

## 2. Goals and Non-Goals

### Goals

- **Portable and client-configurable.** EventLens is not a hosted platform — it's a deployable tool. The client provides their own API keys, their own Google Drive folder, their own Supabase instance. The architecture is designed so that a new deployment means configuring environment variables, not forking code. The intermediate milestone is clients inputting their own Drive folder ID; the end state is a fully white-labeled, self-service deployment.

- **Lightweight by design.** An event gallery doesn't need to stay live forever. It needs to work well for the window the organizer decides to keep it up — a few days, a few weeks, maybe a month. The infrastructure reflects this: Google Drive as storage (no S3 buckets to manage), Vercel serverless (scales to zero), Supabase free tier. There's no long-running infrastructure to babysit.

- **AI features as first-class capabilities, not add-ons.** Face matching, semantic search, auto-tagging, and duplicate detection are core to the product, not optional extras bolted on later. The pipeline, schema, and UI are all designed around the assumption that every photo will be AI-processed.

- **Organizer-controlled pipeline.** Processing runs when the organizer triggers it from the admin dashboard. Photos flow in one direction: Drive → pipeline → database → gallery. Attendees consume the gallery; organizers control what's in it.

### Non-Goals

- **Multi-tenant SaaS.** EventLens is a single-event-per-deployment tool. There is no `event_id` in the schema, no tenant isolation, no shared infrastructure between events. This is a deliberate scope boundary, not a gap — multi-tenancy is a future evolution (see §8), but the current architecture optimizes for simplicity and portability over multi-tenancy.

- **Attendee photo upload.** Attendees search and download; they don't contribute photos. If organizers want attendees to add photos, they share the Drive folder directly — that's a Google Drive feature, not an EventLens feature. This keeps the trust model simple: organizers control content, the pipeline processes it, attendees consume it.

- **Photo editing or watermarking.** EventLens is a retrieval and discovery tool, not an editing suite. Post-processing happens in whatever tools the organizer already uses.

- **Bundled face embedding model.** The InsightFace face embedding service runs as an external microservice (Python + ONNX Runtime on Railway), not inside the Next.js app. This is a deliberate architectural choice:
  - InsightFace (buffalo_l) requires Python, ONNX Runtime, and ~600MB of model weights — far beyond Vercel's 50MB bundle limit.
  - Face embedding is CPU-intensive; web serving is I/O-bound. Different workload profiles belong on different infrastructure.
  - A persistent Railway process avoids reloading the model on every serverless cold start (model load is 10-20s, which would consume a significant portion of the 300s execution budget).
  - Decouples model upgrades from app deploys — the face model can be swapped without touching the Next.js application.

- **Mobile-native app.** The gallery is a responsive web app. A native app would add build/deploy complexity without meaningfully improving the core use case (find your photos, download them).

### Not Yet (Future Scope)

- **Social features.** Posting to social media from the app, like counts, share tracking — these are natural extensions but out of scope for the core retrieval problem.
- **Cross-domain reuse.** The AI pipeline (vision analysis → embedding → vector search) is general-purpose. A near-term application is bulk [Four Corners metadata generation](https://github.com/The-Tech-Margin/four-corners-metadata-generator) for photographers, using the same describe phase to extract provenance metadata at scale.
- **Multi-tenant evolution.** Adding an `events` table, scoping all queries by `event_id`, and building organizer auth. The current single-tenant architecture was designed to make this migration clean (see §8).

## 3. Architecture Decisions

### 3.1 Google Drive as the Storage Layer

**Decision:** Google Drive is not just the storage backend — it *is* the product's entry point. A non-technical organizer points EventLens at a Drive folder, and the system builds a fully functional AI-powered gallery from its contents.

**Why this is the right abstraction:**
- **Zero friction for organizers.** Event photos already land in Google Drive. Contributors dump photos into shared folders without coordination. EventLens meets organizers where their data already lives rather than asking them to move it somewhere else.
- **Zero storage cost.** No S3 buckets to provision, no egress fees to manage, no storage lifecycle policies to configure. Drive is free for the volumes events produce.
- **Built-in CDN.** Google serves thumbnails via `lh3.googleusercontent.com` with on-the-fly resizing (append `=w640`, `=w1920` to the URL). The gallery never proxies image bytes for display — browsers fetch directly from Google's CDN. This keeps Vercel bandwidth near zero and eliminates an entire image-processing layer.
- **No redundant database.** We don't store photos in a database. We store *metadata about* photos (embeddings, descriptions, tags) in Supabase, and the photos themselves stay in Drive. This separation means the organizer's Drive folder is the single source of truth for content, and our database is a derived index that can be rebuilt from scratch.

**Known limitation:** The Drive API doesn't paginate reliably past ~100 files per folder listing. The workaround is natural: organizers already organize photos into subfolders (by day, by session, by photographer), and EventLens lists each subfolder independently. This is a constraint we work with, not against.

### 3.2 pgvector in Supabase over a Dedicated Vector Database

**Decision:** Store both relational data and vector embeddings in a single PostgreSQL instance via Supabase's pgvector extension. No dedicated vector database.

**Alternatives considered:** Pinecone, Weaviate, Qdrant, Milvus.

**Rationale:**

- **Scale fit.** EventLens processes <10k photos per event, producing roughly 10k semantic embeddings (768-dim) and up to 30k face embeddings (512-dim, ~3 faces per photo). pgvector with HNSW indexes returns results in single-digit milliseconds at this scale. Dedicated vector databases optimize for 1M+ vectors — their advantages don't materialize at event volumes.

- **One database, one connection, one query.** The `search_photos` RPC function combines vector similarity, full-text `ts_rank`, and trigram matching in a single SQL function. If vectors lived in Pinecone and metadata lived in Postgres, every search would require two round-trips plus client-side merging — adding latency and eventual consistency problems for no performance benefit.

- **No sync problem.** Every photo insert, update, or delete happens in one transaction. With a separate vector store, every mutation needs to happen in two systems, and any failure creates drift between them. At hackathon pace, that complexity isn't justified.

- **Cost.** Supabase's free tier covers the full workload. Pinecone's free tier limits to 1 index with 10k vectors — EventLens needs 2 indexes (face and semantic) and would exceed the limit for a single mid-sized event.

- **Portability.** Supabase is just PostgreSQL. If the vector workload ever outgrows pgvector, the migration path is clear: move vectors to a dedicated store while keeping relational data in place. The current architecture doesn't lock us in.

**When to reconsider:** If EventLens scales to multi-tenant with 100k+ photos across events, or if vector query latency becomes measurable (>50ms), a dedicated vector database would be worth evaluating. At single-event scale, it would be over-engineering.

### 3.3 Two Separate Embedding Spaces

**Decision:** Maintain two independent vector spaces — 768-dimensional semantic embeddings and 512-dimensional face embeddings — in separate tables with separate indexes, rather than a unified embedding.

**Why two spaces, not one:**

These are fundamentally different similarity tasks that operate on different mathematical definitions of "similar."

**Semantic embeddings (768-dim, Gemini)** encode *what's in the scene*: visible text on badges and banners, objects, activities, the number of people, scene descriptions. They're generated by running a vision model over each photo to extract structured text, then embedding that text into a vector space via `gemini-embedding-001`. The query is a natural language string ("people near the demo booth") embedded into the same space. Similarity means *"this description matches that query."*

**Face embeddings (512-dim, InsightFace/ArcFace)** encode *facial geometry*: the spatial relationships between facial landmarks — eye spacing, nose bridge angle, jawline contour. They're generated by the InsightFace `buffalo_l` model, which is trained with ArcFace loss specifically for face re-identification. The query is another face (from a selfie upload), run through the same model. Similarity means *"this face is the same person as that face."*

A unified embedding (like CLIP) would compromise at both tasks. CLIP is designed for image-text alignment — it's good at "does this image match this caption?" but poor at distinguishing between two similar-looking faces. ArcFace-trained models outperform CLIP at face re-identification by a wide margin because they're optimized for exactly that task.

Each embedding space gets its own table (`photos.description_embedding` vs `face_embeddings.embedding`), its own HNSW index, and its own RPC function (`search_photos_semantic` vs `match_faces`). They never intersect — a face match and a semantic search are independent operations that return independent result sets.

### 3.4 Serverless Pipeline on Vercel

**Decision:** Run the 6-phase AI pipeline as Vercel serverless functions (300s max execution) with wall-clock guards, rather than a long-running background worker.

**Alternatives considered:** Bull/BullMQ job queue with Redis, a dedicated Node.js worker on Railway (alongside the face-api service), AWS Step Functions.

**Why Vercel, not Railway:**

The face-api service already runs on Railway — so why not put the pipeline there too? Because the pipeline is stateless API orchestration (calling Gemini, Drive, and Supabase), not a workload that needs a persistent process. The face-api needs Railway for a specific reason: upload-time face matching must run against the *exact same InsightFace model* that produced the stored embeddings. Model consistency requires a persistent process with 600MB of weights loaded in memory. The pipeline has no such requirement — Gemini is a hosted API that returns the same results regardless of where you call it from.

For a tool that processes photos once or twice per event and then goes idle for weeks, the deciding factors are practical:

- **Cost at rest.** Vercel serverless costs zero when idle. A Railway worker charges ~$5/month minimum to sit there waiting. For a lightweight, ephemeral event tool, paying for always-on infrastructure isn't justified.
- **Single deployment target.** Everything except the face-api deploys via `git push` to Vercel. Adding a second Railway service means two deploy pipelines and two environments for a workload that doesn't need persistence.
- **Face embedding is optional.** Not every event needs face matching — some organizers may want only text descriptions and semantic search, skipping the face-embed pipeline phase entirely. In that case, the Railway face-api service isn't deployed at all, and the entire system runs on Vercel alone. Putting the pipeline on Railway would tie it to infrastructure that some deployments don't use.

**The tradeoff: 300s time limit.** Vercel hard-kills functions after 300 seconds. This constraint required wall-clock guards and resumable batch design — complexity that wouldn't exist on Railway. Every pipeline phase checks `Date.now() - startTime > 250_000` before processing the next photo. When the guard fires, the phase stops cleanly and returns `{processed: N, remaining: M, done: false}`. The admin dashboard sees remaining work and re-triggers the pipeline.

This works because each photo's status is tracked individually in the database (`pending → processing → completed → error`). The next invocation picks up exactly where the previous one left off. The pipeline is **naturally idempotent and resumable** — not because we designed for elegance, but because the serverless constraint required it. The 50s buffer (300s limit minus 250s guard) ensures in-flight work (a Gemini API call, a face embedding request) has time to finish and commit before Vercel terminates the process.

**When to reconsider:** If EventLens becomes multi-tenant with frequent pipeline runs across many events, a persistent worker (Railway or otherwise) would eliminate the wall-clock guard overhead and allow in-memory rate limiting across batches. The current in-memory rate limiter resets on every invocation, which slightly underutilizes the Gemini API quota. A Redis-backed rate limiter or a persistent worker would solve this.

### 3.5 CDN-First Image Strategy

**Decision:** The gallery never proxies image bytes through the server for display. Browsers fetch directly from Google's CDN (`lh3.googleusercontent.com`). The server only handles image bytes during pipeline processing, video streaming, and ZIP downloads.

**How it works:** Every photo's `thumbnailUrl` is a parameterized Google CDN URL: `https://lh3.googleusercontent.com/d/{fileId}=w640`. The `=w640` suffix tells Google's CDN to resize on the fly — no image processing layer needed on our side. For the lightbox, we request `=w1920`. For pipeline processing, we download the full image as base64 to send to Gemini and InsightFace.

**Why not use Next.js Image optimization:** Next.js `<Image>` normally routes images through `/_next/image`, Vercel's built-in optimization proxy. But Google's CDN returns 404s when the Next.js image optimizer fetches server-side — Google detects and blocks the proxy request pattern. The fix is `unoptimized={true}` on all `<Image>` components, which tells Next.js to skip its proxy and let browsers fetch directly from Google.

This isn't a workaround — it's the correct architecture. Google's CDN already handles resizing, format optimization, and global edge caching. Running those same bytes through Vercel's image optimizer would add latency, consume Vercel bandwidth budget, and produce no quality improvement. The `unoptimized` flag removes a redundant layer.

**When the server proxies bytes:**
- **Video streaming** (`/api/video`): Browsers can't stream video directly from Drive URLs. The API route proxies with HTTP range request support for seek/scrub.
- **ZIP downloads** (`/api/download-zip`): The server fetches individual photos from Drive and assembles them into a ZIP archive on the fly.
- **Pipeline processing**: The describe, embed, and face-embed phases download images as base64 to send to Gemini and InsightFace APIs.

**Cost impact:** For a gallery with 2,000 photos and 500 daily visitors, this architecture keeps Vercel bandwidth near zero for gallery browsing. All image serving is Google's CDN cost (free). The only Vercel bandwidth is API responses (JSON), video proxy, and ZIP downloads — a fraction of what full image proxying would cost.

### 3.6 Hybrid Search: Three Modalities

**Decision:** Combine semantic vector search, full-text search (`tsvector`), and trigram fuzzy matching (`pg_trgm`) with additive scoring, rather than relying on any single search modality.

**Why each modality alone is insufficient:**

- **Vector search** handles semantic intent — "outdoor group photo" matches photos described as "people gathered in the courtyard" even though no words overlap. But it misses exact text: if someone searches for "MIT" and it's literally printed on a banner in the photo, pure vector search might rank a semantically similar but textually wrong result higher.

- **Full-text search** (`tsvector` with `ts_rank`) handles exact word matching with stemming — "running" matches "run," "engineers" matches "engineering." But it fails on partial words, typos, and proper names that aren't in the dictionary. It also can't handle semantic similarity at all — "outdoor gathering" won't match "people in the courtyard."

- **Trigram search** (`pg_trgm`) handles the fuzzy middle ground. It compares strings by their 3-character sliding windows: "duck" produces `{" d", " du", "duc", "uck", "ck "}`. This catches typos ("Harvrd" → "Harvard"), partial matches ("robt" → "robot"), and name variations on badges where the vision model extracted "Dr. Sarah Chen" and someone searches "sarah chen." Trigram similarity degrades gracefully with character-level differences rather than failing on exact-match boundaries.

**How they combine:** All three modalities run in parallel against the same query. Results are merged by photo ID with additive scoring:
- Full-text: `ts_rank × 10`
- Trigram: `similarity × 5`
- Vector: `cosine_similarity × 20`

A photo that appears in all three result sets gets the highest combined score. A photo that only appears in vector results still surfaces, but ranks lower than one with both semantic and textual relevance. This means a search for "duck robot" finds the photo where the vision model described "a duck-shaped robot on a table" (vector hit), the visible text reads "DuckBot" (full-text hit), and a typo like "duk robot" still works (trigram hit).

**Why this matters for face matching too:** The hybrid search covers text-based retrieval, but face matching is a separate operation (§3.3). The real power is combining them: an attendee uploads a selfie *and* types "duck robot" — the face match finds photos of that person, and the text search finds photos of the duck robot. The UI can present both result sets, letting the attendee find "photos of me near our project" through a combination of modalities that no single search approach could handle.

## 4. Data Model

### 4.1 Core Schema

Two primary tables with a 1:many relationship, connected by `drive_file_id`:

```
photos                                    face_embeddings
├── id (UUID PK)                          ├── id (UUID PK)
├── drive_file_id (TEXT, UNIQUE, NOT NULL) ◄──── drive_file_id (TEXT, NOT NULL, FK CASCADE)
├── filename (TEXT)                        ├── filename (TEXT)
├── drive_url (TEXT)                       ├── folder (TEXT)
├── folder (TEXT)                          ├── face_index (INT)
├── visible_text (TEXT)                    ├── embedding (VECTOR(512), nullable)
├── people_descriptions (TEXT)             ├── bbox_x1, bbox_y1, bbox_x2, bbox_y2 (FLOAT8)
├── scene_description (TEXT)               └── created_at (TIMESTAMPTZ)
├── face_count (INT)                       UNIQUE(drive_file_id, face_index)
├── mime_type (TEXT)
├── status (TEXT: pending|processing|completed|error)
├── error_message (TEXT)
├── description_embedding (VECTOR(768))
├── search_vector (TSVECTOR, generated)
├── phash (BIGINT)
├── hidden (BOOLEAN, default false)
├── auto_tag (TEXT)
├── processed_at (TIMESTAMPTZ)
└── created_at (TIMESTAMPTZ)

match_sessions (analytics)
├── id (UUID PK)
├── tier (TEXT: vector|text|visual|both)
├── match_count (INT)
├── top_confidence (INT)
├── query_embedding (VECTOR(512), nullable)
├── matched_photo_ids (TEXT[])
└── created_at (TIMESTAMPTZ)
```

**Why `photos` and `face_embeddings` are separate tables:** A photo can contain zero, one, or many faces. Face embeddings are 512-dimensional vectors representing individual facial geometry — one per detected face, each with its own bounding box. Putting these on the photos table would require either an array column (losing per-face bounding boxes and making vector indexing impossible) or denormalizing to one-photo-per-face (duplicating all photo metadata). The 1:many relationship is the natural model: one photo row, N face embedding rows.

**`drive_file_id` as the canonical identifier:** Google Drive assigns every file a permanent, immutable ID that survives renames and folder moves. This is a critical property: when an organizer moves a photo from "Day 1" to "Day 2" or renames a file, the `drive_file_id` stays the same. All the expensive AI-generated data — embeddings, descriptions, face vectors — remains connected to the photo without reprocessing. The sync phase (§5) detects renames and moves by comparing stored filenames/folders against Drive state, updates the metadata, but never needs to regenerate embeddings.

Migration 008 formalized this by making `drive_file_id` NOT NULL and UNIQUE on the photos table, adding a foreign key from `face_embeddings` with CASCADE delete (removing a photo automatically removes its face embeddings), and cleaning up any orphaned rows from early development.

### 4.2 Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `idx_photos_description_embedding` | HNSW (m=16, ef_construction=64) | Semantic vector search on 768-dim embeddings |
| `idx_face_embeddings_hnsw` | HNSW, **partial** (WHERE embedding IS NOT NULL) | Face vector search on 512-dim embeddings, excluding sentinel rows |
| `idx_photos_search_vector` | GIN | Full-text search on generated tsvector |
| `idx_photos_visible_text_trgm` | GIN (pg_trgm) | Trigram fuzzy matching on visible text |
| `idx_photos_people_desc_trgm` | GIN (pg_trgm) | Trigram fuzzy matching on people descriptions |
| `idx_photos_scene_desc_trgm` | GIN (pg_trgm) | Trigram fuzzy matching on scene descriptions |
| `idx_photos_phash` | B-tree (WHERE phash IS NOT NULL) | Perceptual hash lookup for duplicate detection |
| `idx_photos_hidden` | B-tree (WHERE hidden = true) | Fast filtering of soft-deleted photos |
| `idx_photos_auto_tag` | B-tree (WHERE auto_tag IS NOT NULL) | Album/tag grouping |
| `idx_match_sessions_created` | B-tree (created_at DESC) | Recent activity queries |
| `idx_match_sessions_photo_ids` | GIN | Array containment for co-occurrence queries |

The face embeddings HNSW index is **partial** — it excludes rows where `embedding IS NULL`. This is the sentinel pattern: photos with no detected faces get a marker row (`face_index = -1`, `embedding = NULL`) so the pipeline knows they've been processed and doesn't re-attempt face extraction on every run. The partial index means these sentinels never enter the vector search space.

### 4.3 RPC Functions

| Function | Input | Purpose |
|----------|-------|---------|
| `match_faces(vector(512), threshold, limit)` | Selfie face embedding | Cosine similarity search on face_embeddings, returns photos + similarity scores |
| `search_photos(text, limit)` | Search query string | Hybrid full-text (ts_rank × 10) + trigram (similarity × 5) search |
| `search_photos_semantic(vector(768), threshold, limit)` | Query text embedding | Cosine similarity on description_embedding |
| `find_duplicate_clusters(hamming_threshold)` | Hamming distance cutoff | XOR + bit_count on phash pairs to cluster near-duplicates |
| `get_recent_match_activity(hours, limit)` | Time window | Activity ticker for gallery UI |
| `get_hot_photo_ids(top_n, hours)` | Count + window | Most-frequently-matched photos |
| `get_unique_operatives_count()` | — | Count of distinct face searches |
| `find_similar_sessions(vector(512), threshold, limit)` | Face embedding | Find previous match sessions with similar faces (smart retry) |
| `get_cooccurrence_recommendations(photo_ids[], exclude[], limit)` | Matched photo IDs | "You might also appear in" — photos that co-occur in match results |

All search-facing RPCs filter `WHERE hidden IS NOT TRUE` to exclude soft-deleted photos.

### 4.4 Migration Progression

The 12 migrations tell the story of iterative feature development, not a pre-planned schema:

| # | Migration | What it adds | What prompted it |
|---|-----------|-------------|------------------|
| 001 | `match_faces` | Face matching RPC function | Core face search feature — first query capability |
| 002 | `search_photos` | tsvector, trigram indexes, text search RPC | Text search to complement face matching |
| 003 | `description_embeddings` | 768-dim vector column + HNSW index, semantic search RPC | Semantic search ("outdoor group photo") — text search alone couldn't handle intent |
| 004 | `match_sessions` | Analytics table for match queries | Needed to track usage without storing PII (no selfie images, only embeddings) |
| 005 | `face_embedding_unique_constraint` | UNIQUE(drive_file_id, face_index) | Pipeline re-runs were creating duplicate face rows — needed upsert safety |
| 006 | `face_embedding_hnsw_index` | HNSW vector index on face embeddings | Sequential scan was too slow as face count grew past ~2k |
| 007 | `match_session_analytics` | 5 RPC functions for activity, hot photos, co-occurrence | Gallery UI needed real-time activity ticker and "you might also appear in" recommendations |
| 008 | `drive_file_id_canonical` | NOT NULL + UNIQUE + FK CASCADE, orphan cleanup | Tightened data integrity after early development left orphaned rows; formalized drive_file_id as the stable join key |
| 009 | `sentinel_face_embedding_guard` | Partial HNSW index, NULL filters in match_faces | Pipeline was re-processing photos with no faces on every run — sentinel rows needed to be excluded from vector search |
| 010 | `phash_dedup` | phash column, hidden soft-delete, duplicate clustering RPC | Multiple photographers shooting the same scene created near-duplicates; organizers needed moderation tools |
| 011 | `auto_tags` | auto_tag column + index | Thematic album grouping ("Stage & Keynotes", "Networking") for gallery browsing |
| 012 | `allow_null_face_embedding` | DROP NOT NULL on face_embeddings.embedding | Completed the sentinel pattern — allowed NULL embedding for the face_index=-1 marker rows |

**What this progression demonstrates:** The schema evolved with the product. Search started as text-only (002), added semantic vectors (003), then face vectors were accelerated with HNSW (006). Data integrity was tightened retroactively (005, 008) as pipeline re-runs exposed edge cases. The sentinel pattern (009, 012) was iterated and refined during testing. Each migration solves a specific problem encountered during development — not a theoretical schema design exercise.

## 5. Pipeline Design

### 5.1 Origin: Python to TypeScript

The pipeline was originally a set of Python scripts run from the command line. It was refactored to TypeScript and exposed as an admin API endpoint to enable a click-to-run admin dashboard — the first step toward abstracting EventLens into a shareable tool. An organizer shouldn't need CLI access to process photos.

### 5.2 Six-Phase Flow

```
sync → scan → describe → embed → face-embed → phash
```

Each phase is independently runnable from the admin dashboard. The organizer can:

- **Run individual phases:** Just sync (check for orphans, stale, and new files), just phash (cluster duplicates), just text embeddings, just face embeddings.
- **Run the full pipeline:** Executes phases in sequence, stopping at the first incomplete phase and returning `{done: false}` so the client can re-trigger.

| Phase | What it does | External API | Writes to |
|-------|-------------|--------------|-----------|
| **sync** | Reconciles Drive state with database. Detects renames, folder moves, deletions. Updates metadata; reconnects face embeddings when `drive_file_id` persists across moves. Removes photos deleted from Drive. | Google Drive | `photos`, `face_embeddings` |
| **scan** | Discovers new images in Drive subfolders. Upserts photo rows with `status: pending`. | Google Drive | `photos` |
| **describe** | Downloads each photo as base64, sends to Gemini Vision for structured analysis (visible text, people descriptions, scene description, face count). Generates 768-dim text embeddings in batches of 100. | Gemini Vision + Embedding | `photos` (metadata + embedding) |
| **embed** | Backfill pass: generates description embeddings for any photos that have metadata but missing embeddings (e.g., from a previous run that timed out before embedding). | Gemini Embedding | `photos` (embedding only) |
| **face-embed** | Downloads photo thumbnails, sends to InsightFace on Railway. Stores one row per face with 512-dim embedding + bounding box. Creates sentinel rows (`face_index: -1`, `embedding: NULL`) for photos with no detected faces. | InsightFace (Railway) | `face_embeddings` |
| **phash** | Downloads small thumbnails (64px), resizes to 9×8 grayscale, computes 64-bit dHash (difference hash). Stores as signed BigInt for Hamming distance comparison. | Google Drive (thumbnails only) | `photos` (phash column) |

### 5.3 Error Handling: Per-Photo, Not Per-Batch

When a photo fails — Gemini returns garbage, the face-api times out, a Drive image 404s — the error is caught, the photo is marked `status: "error"` with the error message, and **the pipeline continues to the next photo.** The batch never fails entirely.

```
for (const photo of photos) {
  if (Date.now() - startTime > MAX_DURATION_MS) break;  // wall-clock guard
  try {
    // ... process photo ...
    await store.updatePhotoMetadata(fid, { status: "completed" });
  } catch (err) {
    await store.updatePhotoMetadata(fid, { status: "error", error_message: msg });
    errors.push(photo.filename);
    // continue — don't abort the batch
  }
}
```

The admin dashboard shows error counts. A "Retry Errors" button re-queues all errored photos back to `pending` status and re-runs the describe phase. This lets the organizer fix transient issues (API rate limits, temporary outages) without reprocessing photos that already succeeded.

### 5.4 Retry Strategy

Individual API calls use exponential backoff with jitter (`src/lib/pipeline/retry.ts`):

- **Max attempts:** 3
- **Base delay:** 2,000ms, doubling each attempt
- **Max delay:** 60,000ms
- **Jitter:** ±25% to prevent thundering herd
- **Retry-After:** If the API returns a `Retry-After` header (common with Gemini 429s), the retry respects it instead of using calculated backoff
- **Retryable status codes:** 429 (rate limit), 500, 502, 503 (server errors)
- **Non-retryable errors** (400, 403, 404) fail immediately — no point retrying a bad request

### 5.5 Rate Limiting

A sliding-window rate limiter (`src/lib/pipeline/rate-limiter.ts`) throttles Gemini API calls to 30 requests per minute. Before each API call, the limiter checks how many requests have been made in the last 60 seconds. If the limit is reached, it sleeps until the oldest request ages out of the window.

As noted in §3.4, this rate limiter is in-memory and resets on every serverless invocation. The workaround is conservative defaults — the limiter assumes a fresh window on each call, which slightly underutilizes the quota but never exceeds it.

### 5.6 Gemini JSON Parsing

Gemini Vision returns structured JSON describing each photo, but the output isn't always well-formed. Large or complex images can produce responses that get truncated mid-JSON (hitting token limits), and Gemini sometimes wraps JSON in markdown fences.

The parser (`src/lib/pipeline/gemini-client.ts`) uses three levels of recovery:

1. **Direct parse:** Strip markdown fences (`\`\`\`json`), parse JSON. Works ~90% of the time.
2. **Truncation recovery:** Close unclosed quotes, braces, and brackets, then re-parse. Handles the common case where Gemini's output was cut short mid-field.
3. **Regex extraction:** Pull individual field values (`visible_text`, `people_descriptions`, `scene_description`, `face_count`) via regex. Salvages partial data even from badly mangled output.

This defensive strategy means a photo with a truncated Gemini response still gets whatever metadata was extractable, rather than failing entirely. The `normalizeAnalysis` function coerces types (string face_count → number, missing fields → empty strings) so downstream code never sees unexpected types.

### 5.7 Full Pipeline Orchestration

When "full" mode is selected, phases run sequentially. If any phase returns `{done: false}` (hit the wall-clock guard with remaining work), the orchestrator stops and returns the accumulated result with `phase: "full (paused at describe)"`. The admin dashboard re-triggers the pipeline, which resumes from where it left off because:

- **sync/scan** are idempotent (re-listing Drive produces the same upserts)
- **describe** only processes photos with `status: pending` or `error`
- **embed** only processes photos with metadata but missing embeddings
- **face-embed** tracks which photos have been processed via the composite unique key
- **phash** only processes photos without a phash value

The face-embed phase is conditionally included — it only runs if `FACE_API_URL` is configured. Deployments without face matching skip it entirely.

## 6. Search Architecture

EventLens supports three search modalities that run in parallel and merge results into a single ranked list.

### 6.1 Text Search (Full-Text + Trigram)

The `search_photos` RPC function (`supabase/migrations/002_search_photos.sql`) runs entirely in PostgreSQL:

**Full-text search** uses a `tsvector` column auto-generated from `visible_text`, `people_descriptions`, `scene_description`, `filename`, and `folder`. PostgreSQL stems terms ("running" matches "run"), handles stop words, and ranks by term frequency and position. Indexed with GIN for fast lookup.

**Trigram search** (`pg_trgm`) compares 3-character sliding windows between the query and each text field. This catches what full-text misses: partial words, typos ("Harvrd" → "Harvard"), names on badges, and substrings. Each text column has its own GIN trigram index.

**ILIKE fallback** — a plain substring match as a safety net for cases where both full-text and trigram have low confidence but the query string appears verbatim in the metadata.

Results qualify if *any* modality matches (OR logic in the WHERE clause), but ranking uses *all* modalities (additive scoring):

```sql
rank = ts_rank_cd(search_vector, query) * 10
     + greatest(similarity across all text fields) * 5
```

### 6.2 Semantic Search (Vector)

The API route (`src/app/api/search/route.ts`) embeds the query string into the same 768-dimensional space as the stored photo descriptions using `gemini-embedding-001`. The `search_photos_semantic` function performs cosine similarity search against the `description_embedding` column using pgvector's HNSW index, with a minimum similarity threshold of 0.35.

This handles intent-based queries: "people celebrating" finds photos described as "group cheering and high-fiving near the stage" even though no words overlap with the query.

### 6.3 Score Merging

Text and semantic searches run in parallel (`Promise.all`). Results merge into a single Map keyed by photo ID:

- Photos found by text search get their `rank` score from the RPC function
- Photos found by semantic search get `similarity × 20` as their score
- Photos found by **both** searches get both scores added together — these are the highest-confidence results

The `× 20` multiplier on semantic similarity normalizes it against the text rank scale. A cosine similarity of 0.8 becomes a score of 16, competitive with a strong full-text match. The final list is sorted by combined score.

**Why additive merging works:** A photo that matches both "the query contains words found in the image" (text) AND "the query's meaning is similar to the image description" (semantic) is almost certainly relevant. Additive scoring naturally promotes these dual-match results to the top.

### 6.4 Face Matching

Face matching (`src/app/api/match/route.ts`) is a separate flow from text search — it's a visual query, not a text query.

**End-to-end flow:**
1. User uploads a selfie from the gallery UI
2. The selfie is sent as base64 to the InsightFace service on Railway (`/embed` endpoint)
3. InsightFace detects faces and returns 512-dimensional embeddings for each detected face
4. The best face (highest detection confidence score) is selected
5. The embedding is compared against all stored face embeddings using `match_faces` RPC (cosine similarity via pgvector HNSW index)
6. Results are deduplicated per photo (one photo may have multiple face matches if the person appears multiple times), keeping the highest similarity score
7. Matches are returned with confidence percentages

**Tiered confidence:** The `VECTOR_THRESHOLD` of 0.68 filters low-confidence noise. Results above this threshold are returned with their similarity score as a percentage, allowing the UI to communicate confidence levels to the user.

**Co-occurrence recommendations:** After finding face matches, the system queries for photos that frequently appear alongside the matched person (e.g., teammates, collaborators). This uses the `getCooccurrenceRecommendations` function — if person A appears in photos 1, 3, 7 and person B appears in photos 1, 3, 5, 7, photos of person B are recommended when searching for person A.

**Session analytics:** Each match query is saved to `match_sessions` with the query embedding and result metadata. The `findSimilarSessions` function checks if a similar face has been searched before — if so, it provides a more helpful error message ("We've seen a similar face before but couldn't match this time. Try a clearer photo.") instead of a generic "no results."

### 6.5 Combined Search: Face + Text

The gallery supports combining face matching with text search. A user can upload a selfie to find photos of themselves, then layer a text query on top (e.g., "duck robot") to narrow results to photos where they appear *and* the described object is present. The frontend intersects the two result sets — this happens client-side since both queries return full photo metadata.

## 7. Component Architecture

### 7.1 Delegation Pattern

```
page.tsx (17 lines)
  └── ErrorBoundary + Suspense + PhotoGallery
```

`page.tsx` does three things: wraps in an error boundary, provides a loading state, and renders `PhotoGallery`. It delegates all behavior. This is intentional — the page is an orchestrator, not an implementor.

### 7.2 Hook Decomposition

`PhotoGallery` orchestrates 8 custom hooks, each owning a single domain of state and behavior:

| Hook | Responsibility |
|------|---------------|
| `usePhotos` | Fetches and caches photo data from Supabase |
| `useSearch` | Manages search query state, debouncing, API calls to text + semantic search |
| `useFilters` | Filter/sort state (folder, tag, sort order) and derived filtered photo list |
| `useSelection` | Multi-select state for batch operations (download ZIP, collage) |
| `useCollage` | Collage generation from selected photos |
| `useStats` | Computed statistics (photo counts, folder counts, processing status) |
| `useProgressiveRender` | Renders photos in batches to prevent UI blocking on large galleries |
| `useUrlSync` | Syncs filter/search state to URL search params for shareable links |

**Why hooks, not a state manager:** At this scale (~8 independent state domains, no cross-cutting transactions), hooks are simpler than Redux or Zustand. Each hook is testable in isolation, and the dependency graph is explicit in `PhotoGallery`'s imports. A state manager would add indirection without solving a problem that exists.

### 7.3 Component Decomposition

The gallery renders 13+ components, each responsible for a single visual concern:

- **PhotoGrid / PhotoCard** — Grid layout and individual photo display with CDN thumbnails
- **GalleryHeader / HeroSection** — Event branding and hero display
- **FolderTabs / TagTabs** — Navigation by Drive folder or auto-generated tag
- **FilterSortBar** — Search input, sort controls, active filter display
- **AlbumGrid** — Album-style grouped view
- **Lightbox** — Full-screen photo viewer with navigation
- **SearchStatus** — Shows active search query, result count, search modality used
- **PhotoUpload** — Selfie upload for face matching
- **TerminalLoader** — Loading state (Suspense fallback)

### 7.4 Development Process

This decomposition was not designed upfront on a whiteboard. The process was:

1. **Prototype fast** — get the feature working in a single component
2. **Verify the UX** — test interactions, iterate on behavior
3. **Recognize extraction points** — a component has multiple `useState` calls that don't interact, or the JSX has sections separated by comments. These are signals that abstractions want to exist.
4. **Extract and define interfaces** — pull the state into a hook, the JSX into a component, and define the props/return types that connect them

The architect's value is step 3: knowing where to cut and why. Any tool can generate a 600-line component or split it into 15 files — but it takes domain understanding to know which decomposition reflects actual boundaries.

## 8. Tradeoffs and Open Questions

### What we'd keep

- **Google Drive as source of truth** — the core product insight. Zero storage cost, familiar to organizers, CDN thumbnails for free.
- **pgvector in Supabase** — right tool at this scale (<10k photos, <30k face embeddings). One database for relational, vector, and full-text. No sync problems.
- **Two separate embedding spaces** — face geometry and scene semantics are fundamentally different similarity tasks. Merging would degrade both.
- **Per-photo error handling** — the pipeline never fails entirely. Battle-tested against real Gemini API behavior.
- **Defensive Gemini parser** — generative AI output is probabilistic, not deterministic. Graceful degradation is not optional.
- **InsightFace on Railway** — the upload-time face matching must run against the same model that produced stored embeddings. A persistent process guarantees model consistency and avoids reloading 600MB of weights on every request.

### What we'd improve

- **Auth:** The current `auth=true` cookie is a prototype placeholder with no signature or expiry. For a portable tool, the organizer needs real authentication — even lightweight (Supabase Auth with magic link, or a hashed admin password). This is the most obvious gap.
- **Admin dashboard:** Currently a 626-line single component. Same decomposition principle applied to the gallery needs to be applied here — pipeline controls, status display, moderation tools, and settings are distinct responsibilities.
- **In-memory rate limiter:** Works for single-tenant because each serverless invocation processes one batch. Would need distributed state (Redis, or a Supabase row tracking request timestamps) for concurrent users or multi-instance deployments.
- **CDN thumbnail assumption:** The `lh3.googleusercontent.com` CDN URL pattern works for Drive files shared with "anyone with the link." If an organizer's Drive permissions are more restrictive, thumbnails would 404. The app should detect this and fall back to API-proxied thumbnails gracefully.

### What turned out to not be issues

- **Drive pagination:** The current implementation correctly follows `nextPageToken` in a loop. An earlier version of the project notes flagged this as a bug, but the TypeScript rewrite resolved it.
- **Serverless time limits:** The wall-clock guard + idempotent phase design handles the 300s Vercel limit cleanly. Each re-trigger resumes from where it left off. The constraint forced a good pattern (resumable, individually tracked photos) even though it was a pragmatic choice, not a technical preference.

## 9. Future: Portable Tool Evolution

### 9.1 Design Philosophy

EventLens is intentionally lightweight and ephemeral. An event gallery doesn't need to stay live forever — it needs to work well for the time the organizers decide to keep it up. The architecture supports this: Google Drive holds the photos (the organizer already has them there), Supabase holds only metadata and embeddings (disposable), and the app itself is a stateless Next.js deployment.

The goal is not multi-tenant SaaS but a **portable, customizable tool** that any organizer can deploy for their event by providing their own keys and services.

### 9.2 Minimal Changes for Portability

1. **Setup wizard** — a first-run experience that collects Drive folder ID, API keys, and event branding. Currently these are environment variables; a wizard would write them to Vercel env vars or a config file.
2. **Auth improvement** — replace the prototype cookie with Supabase Auth or a simple hashed-password check. The organizer sets a password during setup.
3. **Dynamic theming** — extract the current hardcoded color scheme (matrix green/magenta) into CSS custom properties or a theme config. The organizer picks colors during setup.
4. **Face matching as optional** — already partially implemented (face-embed phase skips if `FACE_API_URL` is unset). The UI should gracefully hide face matching features when the service isn't configured.

### 9.3 Adjacent Applications

The AI pipeline (Gemini Vision → structured metadata → embeddings) is not specific to event photos. The same architecture could power:

- **Four Corners metadata generation** — bulk-generating photographer metadata ([github.com/The-Tech-Margin/four-corners-metadata-generator](https://github.com/The-Tech-Margin/four-corners-metadata-generator)) using the same Gemini Vision analysis that currently produces `visible_text`, `people_descriptions`, and `scene_description`
- **Social features** — likes, share counts, posting to social from the app
- **Portfolio tools** — photographer galleries with AI-generated alt text and search

These are future explorations, not committed roadmap. The architecture is designed to make them possible without restructuring the core.

## 10. Tests and CI

### 10.1 Test Strategy

Tests are co-located with source files following the `[module].test.ts` convention (matching MIT Open Learning's pattern). Tests focus on the embedding pipeline — the most technically complex and externally-dependent part of the codebase.

| Test file | What it covers |
|-----------|---------------|
| `gemini-client.test.ts` | 3-level JSON parser (clean, truncated, regex fallback), markdown fence stripping, type normalization, batch embedding chunking |
| `face-api-client.test.ts` | Health check retry logic (cold start recovery), embedding extraction, auth header handling, graceful failure on missing faces |
| `retry.test.ts` | Exponential backoff, jitter, Retry-After header respect, retryable vs non-retryable status codes, attempt exhaustion |
| `rate-limiter.test.ts` | Sliding window throttling, timestamp pruning, independent instance isolation |
| `face-embed.test.ts` | Phase orchestration, wall-clock guard, sentinel creation for faceless photos, per-photo error handling |
| `embed.test.ts` | Embedding backfill phase, batch processing, skip-already-embedded logic |

All tests use mocked `fetch` and module mocks — no external APIs, databases, or secrets required. Tests run in ~2 seconds.

### 10.2 CI Pipeline

GitHub Actions runs on every push and PR to `main`:

```
npm ci → jest (52 tests) → tsc --noEmit → eslint → next build
```

If any step fails, the build fails and Slack is notified via incoming webhook (configurable via `SLACK_WEBHOOK_URL` repository secret). The notification includes the branch, commit message, and a direct link to the failed run. When the webhook secret is not configured, the notification step is silently skipped.

### 10.3 Why These Tests

The pipeline is where EventLens interacts with external AI services (Gemini, InsightFace) that return non-deterministic output. The defensive JSON parser, retry logic, and rate limiter are the code most likely to regress when dependencies change. Testing these in isolation — with mocked API responses that reproduce real failure modes (truncated JSON, 429 rate limits, cold start timeouts) — gives confidence without requiring live API keys in CI.
