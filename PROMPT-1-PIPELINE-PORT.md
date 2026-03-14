# Prompt: Port Python Pipeline to TypeScript for Vercel Serverless

## Objective

Port `scripts/process_photos.py` (1000 lines, 6 phases) to TypeScript as Next.js API routes that run within Vercel serverless function constraints. The Python pipeline currently spawns via `child_process.spawn()` from `src/app/api/admin/pipeline/route.ts` — this is incompatible with Vercel's deployment model. Replace it with native TypeScript modules and API routes.

---

## Constraints

- **Vercel function timeout**: 10s default, up to 300s on Pro plan (`maxDuration` in route config). Plan for 300s max per invocation.
- **No persistent processes**: Each API route invocation is stateless. Long pipelines must be chunked into per-photo or per-batch invocations, with Supabase as the state store.
- **No filesystem persistence**: `/tmp` is available (512MB) but ephemeral. Use it only for transient image processing (sharp buffers, etc.).
- **No Python dependencies**: Replace PIL/Pillow with `sharp`, replace `tenacity` with custom retry, replace `requests` with `fetch`.
- **Edge-compatible where possible**: Rate limiting and lightweight routes can target edge runtime.

---

## Architecture

### File Structure

```
src/lib/pipeline/
├── rate-limiter.ts       // Sliding-window rate limiter
├── retry.ts              // Exponential backoff retry wrapper
├── drive-client.ts       // Google Drive API operations
├── gemini-client.ts      // Gemini vision analysis + batch embeddings
├── face-api-client.ts    // InsightFace external API client
├── supabase-store.ts     // All Supabase CRUD for pipeline operations
├── phash.ts              // dHash perceptual hashing via sharp
├── phases/
│   ├── sync.ts           // phase_sync — reconcile Drive ↔ Supabase
│   ├── scan.ts           // phase_scan — discover new photos from Drive
│   ├── describe.ts       // phase_describe — Gemini vision + embeddings
│   ├── embed.ts          // phase_embed_only — backfill embeddings
│   ├── face-embed.ts     // phase_face_embed — InsightFace embeddings
│   └── phash.ts          // phase_phash — perceptual hashing
└── types.ts              // Pipeline-specific types

src/app/api/admin/pipeline/
├── route.ts              // Orchestrator: accepts phase, dispatches work
└── worker/route.ts       // (optional) Per-item worker for long phases
```

### Execution Model

The Python pipeline runs all photos in a single long-running process. On Vercel serverless, use this pattern instead:

1. **Orchestrator route** (`/api/admin/pipeline`): Accepts a phase name. Queries Supabase for work items (photos in the right status). Processes items in a loop with a **wall-clock guard** — check `Date.now()` against start time each iteration and bail out gracefully at ~250s (leaving 50s buffer before the 300s hard kill). Return a response indicating `{ processed: N, remaining: M, done: boolean }`.

2. **Client-side polling**: The admin dashboard calls the pipeline endpoint, gets back progress, and re-calls if `done === false`. This naturally chunks work across multiple function invocations.

3. **No background jobs needed**: The chunked polling pattern avoids Vercel's lack of background workers. Each invocation is a normal request-response cycle.

---

## Module Specifications

### 1. `rate-limiter.ts`

Port the Python `RateLimiter` class. It uses a sliding window (deque of timestamps) to enforce `max_per_minute` calls.

```
Python reference:
- self.max_per_minute (default 30 for Gemini)
- self.timestamps: deque
- wait_if_needed(): pops expired timestamps (>60s old), sleeps if at capacity
- Uses time.sleep() — replace with await new Promise(resolve => setTimeout(resolve, ms))
```

TypeScript implementation:
- Store timestamps in a `number[]` array
- `async waitIfNeeded(): Promise<void>` — prune timestamps older than 60s, if at capacity compute sleep duration and `await` it
- Export as a class: `new RateLimiter(maxPerMinute: number)`

### 2. `retry.ts`

Replace Python's `tenacity` retry decorator. The Python code retries on HTTP 429, 500, 502, 503 with exponential backoff (3 attempts, wait 2-60s).

```typescript
interface RetryOptions {
  maxAttempts?: number;    // default 3
  baseDelay?: number;      // default 2000ms
  maxDelay?: number;       // default 60000ms
  retryableStatuses?: number[];  // default [429, 500, 502, 503]
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>
```

- Exponential backoff: `min(baseDelay * 2^attempt, maxDelay)` plus jitter
- On 429, check `Retry-After` header if the fn returns/throws a response object
- Log each retry attempt

### 3. `drive-client.ts`

Port `DriveClient` class. Note: `src/lib/drive.ts` already has `listDriveImages` and `listDriveSubfolders` — **reuse those** rather than duplicating. The pipeline needs one additional method not in the existing client:

- `downloadMediaBase64(fileId: string): Promise<string>` — Download image as base64 for Gemini vision input
  - Python tries CDN URL first (`lh3.googleusercontent.com/d/{id}=s1024`), falls back to Drive API (`/files/{id}?alt=media`)
  - Use `fetch()` with Google API key
  - Return base64-encoded string
  - The existing `fetchDriveImage` in `src/lib/drive.ts` already does part of this — extend it or add a base64 variant

### 4. `gemini-client.ts`

Port `GeminiClient` with two methods:

**`analyzePhoto(base64Image: string, mimeType: string): Promise<GeminiAnalysis>`**
- Sends image to Gemini 2.5 Flash Lite via `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
- Uses the existing `ANALYZE_PROMPT` (port it as a constant) requesting structured JSON: `{ visible_text, people_descriptions, scene_description, face_count, auto_tag }`
- Must handle Gemini's response parsing: the Python `_parse_gemini_json` handles truncated JSON, markdown fences, and regex fallback — port this robustness
- Integrate `RateLimiter` (30 RPM) and `withRetry`
- Request payload structure:
  ```json
  {
    "contents": [{
      "parts": [
        { "inline_data": { "mime_type": "...", "data": "base64..." } },
        { "text": "ANALYZE_PROMPT" }
      ]
    }],
    "generationConfig": { "temperature": 0.1, "maxOutputTokens": 1024 }
  }
  ```

**`embedTextsBatch(texts: string[]): Promise<number[][]>`**
- Uses `generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents`
- Gemini supports up to 100 texts per batch — chunk if needed
- Returns array of 768-dimensional embedding vectors
- Integrate `RateLimiter` and `withRetry`
- Request payload:
  ```json
  {
    "requests": [
      { "model": "models/gemini-embedding-001", "content": { "parts": [{ "text": "..." }] } }
    ]
  }
  ```

**`_parseGeminiJson(text: string): GeminiAnalysis`** (private helper)
- Strip markdown fences (```json ... ```)
- Try `JSON.parse` first
- If that fails, try truncation recovery: find last complete key-value pair, close braces
- If that fails, regex extraction fallback for each field
- Return partial results rather than throwing — the Python code is very defensive here

### 5. `face-api-client.ts`

Port `FaceApiClient`:

- `healthCheck(): Promise<boolean>` — GET to the face API URL with retries (Python does 12 attempts with 10s sleep for cold starts on Render). On serverless, limit to 3 attempts with shorter waits.
- `getEmbeddings(base64Image: string): Promise<FaceEmbedding[]>` — POST image to face API, returns array of `{ embedding: number[], bbox: number[] }`
- The face API URL comes from `FACE_API_URL` env var
- Auth via `FACE_API_KEY` as Bearer token

### 6. `supabase-store.ts`

Port `SupabaseStore`. This is the largest module. The existing `src/lib/supabase.ts` has the client setup — build on top of it. Key methods:

```
// Photo lifecycle
upsertPhoto(photo: PipelinePhoto): Promise<void>
reconnectPhoto(driveFileId: string, updates: Partial<PipelinePhoto>): Promise<void>
deletePhoto(driveFileId: string): Promise<void>

// Queries
getAllPhotos(): Promise<PipelinePhoto[]>           // paginated internally
getPhotosByStatus(status: string): Promise<PipelinePhoto[]>
getPhotosMissingEmbedding(): Promise<PipelinePhoto[]>
getPhotosMissingPhash(): Promise<PipelinePhoto[]>
getExistingFaceFileIds(): Promise<Set<string>>

// Updates
updatePhotoMetadata(driveFileId: string, metadata: PhotoMetadata): Promise<void>
updateDescriptionEmbeddingsBatch(embeddings: Array<{driveFileId: string, embedding: number[]}>): Promise<void>
upsertFaceEmbedding(data: FaceEmbeddingRow): Promise<void>
updatePhash(driveFileId: string, phash: bigint): Promise<void>
```

Important implementation notes from the Python:
- `_paginate` fetches in pages of 1000 using `.range(offset, offset + page_size - 1)` — Supabase caps at 1000 rows per request
- `upsert_photo` uses `.upsert()` with `on_conflict="drive_file_id"`
- Embedding updates use `.update()` filtered by `drive_file_id` (not by row id)
- The `hidden` column should be respected (`.neq("hidden", true)` on reads)

### 7. `phash.ts`

Port the `dhash` function. Python uses PIL; TypeScript should use `sharp`:

```
Python implementation:
1. Open image, convert to grayscale, resize to 9x8
2. For each row, compare adjacent pixels: bit = 1 if left > right
3. Pack 64 bits into a signed 64-bit integer (for PostgreSQL bigint compatibility)
4. Use struct.unpack('>q', struct.pack('>Q', hash_int)) for unsigned→signed conversion
```

TypeScript with sharp:
```typescript
import sharp from 'sharp';

export async function computeDhash(imageBuffer: Buffer): Promise<bigint> {
  const pixels = await sharp(imageBuffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << BigInt(y * 8 + x);
      }
    }
  }

  // Convert to signed 64-bit for PostgreSQL bigint
  if (hash >= (1n << 63n)) {
    hash -= (1n << 64n);
  }
  return hash;
}
```

Note: `sharp` is already commonly used in Next.js projects and works on Vercel serverless (it's the default image optimizer).

---

## Phase Implementations

### Phase: `sync`

**Purpose**: Reconcile Google Drive state with Supabase. Detect renames, moves, and deletions.

**Python logic**:
1. Fetch all photos from Supabase (all statuses)
2. Fetch all images from Drive (root + subfolders)
3. Build a `drive_map: Map<fileId, {name, folder}>` from Drive results
4. For each Supabase record:
   - If `drive_file_id` exists in `drive_map`: check if filename or folder changed → update if so
   - If `drive_file_id` NOT in `drive_map`: check if a Drive file with the same filename exists → reconnect. Otherwise → mark as deleted or remove row
5. Report counts: `synced`, `reconnected`, `deleted`

**Serverless adaptation**: This phase touches every photo but does lightweight work (no API calls to Gemini/Face). Should complete well within 300s for typical collections (<10k photos). No chunking needed unless the collection is huge.

### Phase: `scan`

**Purpose**: Discover new images in Drive that aren't yet in Supabase.

**Python logic**:
1. Fetch all images from Drive (root + subfolders)
2. Fetch all existing `drive_file_id`s from Supabase
3. For each Drive file not in Supabase: upsert with `status: "pending"`
4. Report count of new photos found

**Serverless adaptation**: Similar to sync — lightweight, no external ML APIs. Single invocation should suffice.

### Phase: `describe`

**Purpose**: Download pending photos, analyze with Gemini vision, store metadata and embeddings.

**Python logic**:
1. Query Supabase for photos with `status: "pending"` (or a specific status)
2. For each photo:
   a. Download image as base64 via Drive
   b. Call `GeminiClient.analyzePhoto()` — rate limited to 30 RPM
   c. Parse structured JSON response
   d. Update Supabase with metadata (visible_text, people_descriptions, scene_description, face_count, auto_tag)
   e. Set `status: "completed"`
3. After each batch of ~20 photos, generate text embeddings:
   a. Concatenate description fields into a single text per photo
   b. Call `GeminiClient.embedTextsBatch()` with up to 100 texts
   c. Store embedding vectors in Supabase
4. Report counts

**Serverless adaptation**: THIS IS THE BOTTLENECK PHASE. At 30 RPM rate limit, you can process ~30 photos per minute. In a 300s function, that's ~125 photos max (accounting for download time and embedding calls). Use the wall-clock guard pattern:

```typescript
const startTime = Date.now();
const MAX_DURATION_MS = 250_000; // bail at 250s, 50s buffer

for (const photo of pendingPhotos) {
  if (Date.now() - startTime > MAX_DURATION_MS) break;
  // ... process photo ...
  processed++;
}

return NextResponse.json({
  processed,
  remaining: pendingPhotos.length - processed,
  done: processed >= pendingPhotos.length,
});
```

The admin UI calls this endpoint repeatedly until `done === true`.

### Phase: `embed` (embed_only)

**Purpose**: Backfill description embeddings for completed photos that are missing them.

**Python logic**:
1. Query for completed photos where `description_embedding IS NULL`
2. Build text from `scene_description + people_descriptions + visible_text`
3. Batch embed via Gemini (chunks of 100)
4. Store embeddings

**Serverless adaptation**: Embedding calls are fast (100 texts per batch). A single invocation should handle thousands. Wall-clock guard as safety net.

### Phase: `face-embed`

**Purpose**: Generate face embeddings via external InsightFace API.

**Python logic**:
1. Health-check the face API (handles cold starts with retries)
2. Get set of `drive_file_id`s that already have face embeddings
3. For each completed photo without face embeddings:
   a. Download image as base64
   b. Send to face API
   c. For each detected face: store embedding (512-dim) and bounding box
4. Report counts

**Serverless adaptation**: The face API may have cold-start latency (Python does 12 retries × 10s = 2 min of waiting). On serverless, do the health check as a separate preliminary call. If the API isn't ready, return early and let the client retry. Once warm, process photos with wall-clock guard.

### Phase: `phash`

**Purpose**: Compute perceptual hashes for duplicate detection.

**Python logic**:
1. Query for completed photos where `phash IS NULL`
2. For each: download image, compute dHash, store in Supabase
3. Report counts

**Serverless adaptation**: `sharp` resize+grayscale is fast (~10ms per image). The bottleneck is downloading from Drive. Wall-clock guard pattern. Should handle ~500+ photos per invocation.

---

## API Route: `/api/admin/pipeline/route.ts`

Replace the current `child_process.spawn` approach:

```typescript
export const maxDuration = 300; // Vercel Pro plan

export async function POST(request: NextRequest) {
  // Auth check (existing Bearer token validation)

  const { phase } = await request.json();

  // Validate phase
  const validPhases = ['sync', 'scan', 'describe', 'embed', 'face-embed', 'phash', 'all'];

  // If phase === 'all', run in sequence: sync → scan → describe → embed → face-embed → phash
  // But on serverless, 'all' should just run the first incomplete phase and return progress

  const result = await runPhase(phase);
  return NextResponse.json(result);
}
```

Each phase function returns: `{ phase: string, processed: number, remaining: number, done: boolean, errors: string[] }`

---

## Environment Variables (no changes)

The pipeline uses these existing env vars — no new ones needed:
- `GOOGLE_API_KEY` — Drive API + Gemini API
- `DRIVE_FOLDER_ID` — Root Drive folder
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase access
- `FACE_API_URL` + `FACE_API_KEY` — InsightFace service
- `ADMIN_TOKEN` — Pipeline auth

---

## Migration Checklist

1. [ ] Create `src/lib/pipeline/` directory structure
2. [ ] Implement `rate-limiter.ts` with tests
3. [ ] Implement `retry.ts` with tests
4. [ ] Extend `src/lib/drive.ts` with `downloadAsBase64()` (or add to pipeline drive-client)
5. [ ] Implement `gemini-client.ts` with `_parseGeminiJson` robustness
6. [ ] Implement `face-api-client.ts`
7. [ ] Implement `supabase-store.ts` (reuse existing client)
8. [ ] Implement `phash.ts` using sharp
9. [ ] Implement each phase in `src/lib/pipeline/phases/`
10. [ ] Replace `/api/admin/pipeline/route.ts` — remove `child_process.spawn`, add phase dispatcher
11. [ ] Update admin UI to poll pipeline endpoint until `done === true`
12. [ ] Delete `scripts/process_photos.py` and `scripts/requirements.txt`
13. [ ] Remove Python venv setup from any CI/CD or documentation
14. [ ] Test each phase independently on Vercel preview deployment
15. [ ] Verify rate limiting works correctly under Vercel's execution model (no shared state between invocations — RateLimiter resets each call, which is fine since Gemini's rate limit is per-API-key not per-process)

---

## Testing Strategy

- Unit test `_parseGeminiJson` with truncated/malformed JSON samples from production
- Unit test `computeDhash` against known hash values (compare with Python output)
- Unit test `RateLimiter` timing behavior
- Integration test each phase against a test Drive folder with 5-10 images
- End-to-end test the polling loop: call pipeline endpoint repeatedly, verify all photos reach `completed` status
- Verify no regressions: existing gallery, search, and match features should work identically since the Supabase schema is unchanged
