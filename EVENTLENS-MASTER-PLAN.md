# EventLens: Refactor & Portfolio Master Plan

**Author:** Sonia / @TheTechMargin
**Date:** March 14, 2026
**Status:** Active

---

## Purpose

This document is the single source of truth for the EventLens refactor. It serves two simultaneous goals:

1. **Paid product** — Transform EventLens from a single-tenant hackathon project into a multi-tenant SaaS where any event organizer signs up, points it at their Google Drive folder, and gets a working AI-powered photo gallery through a UI. No code, no env files, no migrations.

2. **Portfolio piece** — Prepare the codebase as a code sample for a Senior Product Engineer interview at MIT Open Learning. The code, architecture, and documentation should demonstrate ownership, design thinking, and production-quality engineering.

Every refactor decision should pass both filters: "Would a paying client benefit from this?" and "Can I explain the reasoning behind this in a technical interview?"

---

## The Interview Target

**Role:** Senior Product Engineer, MIT Open Learning
**Reports to:** Peter Pinch, Director of Application Development

**Their stack (from mit-learn repo):** Django/Python (56%), TypeScript/React (41%), PostgreSQL, OpenSearch with vector embeddings, Docker Compose, Keycloak auth, Vercel/Heroku, GitHub Actions CI, Storybook, smoot-design shared component library, drf-spectacular OpenAPI generation, Playwright e2e, pytest, pre-commit hooks.

**What they value (from their engineering handbook):** Ownership from concept to production. RFCs before building — architectural design docs capturing scope, approach, and tradeoffs. Documentation that explains "why." Agile without dogma. Open source culture.

**What Peter asked for:** "Share some sample code you have written. Any language, any purpose. It just needs to represent you well."

**Key job requirements that map to EventLens:** TypeScript, React, Next.js. Component architecture and state management. Server-side frameworks. Vector search and embeddings (pgvector maps to their OpenSearch). AI integration (Gemini maps to their AskTim). Relational databases and SQL. Accessibility, performance, mobile-first. Documentation, testing, design systems.

---

## Architecture Overview

```
Google Drive (photo/video storage per event)
       │
Processing Pipeline (TypeScript on Vercel serverless, 300s max)
  ├── Gemini 2.5 Flash Lite → scene/text/people analysis + auto-tags
  ├── Gemini Embedding (gemini-embedding-001) → 768-dim description vectors
  ├── InsightFace (buffalo_l via Flask on Railway) → 512-dim face vectors
  └── Sharp → 64-bit dHash perceptual hashes
       │
Supabase (PostgreSQL + pgvector)
  ├── photos table — metadata, description embeddings, tsvector, phash
  ├── face_embeddings table — face vectors + bounding boxes (HNSW index)
  ├── match_sessions table — face match analytics
  └── RPC functions — match_faces, search_photos, search_photos_semantic
       │
Next.js 15 App (Vercel)
  ├── Gallery — search, browse, match, download, collage
  ├── Admin — pipeline control, status, moderation
  └── API routes — photos, search, match, video proxy, ZIP, auth, admin
```

---

## Current State (Post-Hackathon)

What works well and what doesn't, organized by the two goals.

### What's Strong (Keep / Showcase)

The component decomposition is already done. `page.tsx` is 17 lines — it delegates to `<PhotoGallery />` which orchestrates via hooks (`usePhotos`, `useSearch`, `useFilters`, `useSelection`, `useCollage`, `useStats`, `useProgressiveRender`, `useUrlSync`). Gallery sub-components are well-separated: `PhotoGrid`, `PhotoCard`, `GalleryHeader`, `FolderTabs`, `TagTabs`, `FilterSortBar`, `AlbumGrid`, `HeroSection`, `Lightbox`, `SearchStatus`, etc.

The AI pipeline is the differentiator. Six phases (sync → scan → describe → embed → face-embed → phash), each wall-clock guarded at 250s to fit Vercel's 300s timeout, with the client re-calling until `done: true`. Rate limiting, exponential backoff with jitter, Retry-After header respect, CDN-first download strategy.

Search is genuinely sophisticated. Hybrid semantic (768-dim Gemini embeddings via pgvector cosine similarity) + full-text (tsvector) + trigram matching, merged and ranked. Face matching uses separate 512-dim InsightFace embeddings with tiered confidence (strong/good/possible). Co-occurrence recommendations surface photos where matched faces appear together.

12 Supabase migrations show progressive schema evolution. Feature specs (CLAUDE-AUTOALBUMS.md, CLAUDE-COLLAGE.md, CLAUDE-DEDUP.md) document the development process.

### What Needs Work

**Single-tenant architecture.** Everything is hardcoded to one event via env vars. `config.ts` reads `GOOGLE_DRIVE_FOLDER_ID`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `ADMIN_API_SECRET` as global constants. Every API route, every pipeline phase, every RPC function assumes a single event. There is no `event_id` anywhere in the schema.

**Auth is a security liability.** The auth cookie is literally `auth=true` — a boolean with no signature, no session token, no CSRF protection. `APP_PASSWORD` and `ADMIN_API_SECRET` are plaintext env vars compared via `timingSafeEqual`. This works for a hackathon but fails both the "paying client" and "interview" filters.

**No setup UI.** A client would need to manually edit `.env.local`, run 12 SQL migrations, deploy a Flask microservice, configure API keys across 4 services. Developer experience, not customer experience.

**Theming is hardcoded.** `globals.css` has ~50 CSS custom properties all based on `#00ff41` (matrix green) and `#ff00ff` (magenta). The layout injects `--color-primary` from env vars, but almost nothing in the CSS actually uses those variables.

**Dead code.** `GOOGLE_SHEET_ID` / `sheetId` references remain from a pre-Supabase fallback. Should be removed.

**Admin dashboard is a 626-line monolith.** Needs decomposition for both readability and interview presentation.

**Drive API doesn't paginate.** `listDriveImages` silently drops images beyond the first page (~100) per subfolder.

**Rate limiting is in-memory.** The `RateLimiter` class uses a `timestamps: number[]` array that dies with each serverless invocation. Useless for multi-tenant coordination.

---

## Phase Guide

### Phase 0: Audit & Understanding (No Code Changes)

**Goal:** Map every file, every data flow, every dependency. Identify hackathon shortcuts, security issues, and architectural debt.

**Deliverable:** This document (done). Plus deep familiarity with every architectural decision so Sonia can speak to them fluently.

**Key files to internalize:**

| File | What it does | Interview angle |
|------|-------------|-----------------|
| `src/lib/config.ts` | Singleton config from env vars — root of single-tenant problem | Why env vars don't scale, config-as-data pattern |
| `src/lib/pipeline/rate-limiter.ts` | In-memory sliding window — dies per invocation | Distributed rate limiting, token bucket algorithms |
| `src/lib/pipeline/phases/describe.ts` | Gemini vision + embedding with wall-clock guard | Serverless timeout management, batch processing |
| `src/lib/pipeline/phases/sync.ts` | Drive ↔ Supabase reconciliation | Data consistency, idempotent sync patterns |
| `src/lib/pipeline/retry.ts` | Exponential backoff with jitter, Retry-After | Resilience patterns, backoff algorithms |
| `src/lib/pipeline/gemini-client.ts` | Vision analysis + batch embeddings (100/request) | AI integration, structured output parsing |
| `src/app/api/search/route.ts` | Hybrid semantic + full-text search merge | Vector search architecture, ranking strategies |
| `src/app/api/match/route.ts` | Face embedding cosine similarity with tiers | pgvector, embedding similarity thresholds |
| `supabase/migrations/*` | 12 progressive migrations | Schema evolution, migration strategy |
| `src/components/gallery/PhotoGallery.tsx` | Main orchestrator using 8 custom hooks | Component composition, custom hooks, separation of concerns |

**Status:** Complete.

---

### Phase 1: Foundation (Repo Hygiene)

**Goal:** Small, safe changes. Clean hardcoded values, verify env configuration, tighten .gitignore, remove dead code. Each change is a single logical commit.

#### 1.1 Remove Dead Google Sheets References
- Delete `sheetId` from `EventLensConfig` interface and `config` object in `config.ts`
- Remove `GOOGLE_SHEET_ID` from `.env.example`
- Search for and remove any remaining `sheetId` / `GOOGLE_SHEET_ID` references across the codebase
- **Commit:** `chore: remove dead Google Sheets fallback references`

#### 1.2 Fix Drive API Pagination
- Add `nextPageToken` loop to `listDriveImages` in `drive.ts`
- Currently silently drops images beyond first page (~100) per subfolder
- **Commit:** `fix(drive): paginate file listings to handle folders with 100+ images`

#### 1.3 Verify .gitignore Coverage
- Confirm `.env.local`, `.env`, `node_modules`, `.next`, any credential files are excluded
- Add `services/face-api/__pycache__/` if missing
- **Commit:** `chore: tighten .gitignore coverage`

#### 1.4 Clean Up .env.example
- Remove `GOOGLE_SHEET_ID`
- Add missing `NEXT_PUBLIC_SECONDARY_COLOR`
- Add comments explaining which vars are required vs optional
- Group by service (Google, Gemini, Supabase, Face API, App Config)
- **Commit:** `docs: clean up .env.example with grouping and descriptions`

#### 1.5 TypeScript Strictness Check
- Verify `strict: true` in `tsconfig.json`
- Fix any `any` types that should be properly typed
- Add explicit return types on exported functions where missing
- **Commit:** `chore: tighten TypeScript strictness`

---

### Phase 2: Architecture Refactor (Interview-Ready Code)

**Goal:** Make the codebase demonstrate Senior Product Engineer quality. Consistent patterns, clean composition, meaningful naming, proper types.

#### 2.1 Decompose Admin Dashboard
The admin page (`admin/page.tsx`) is 626 lines. Break into:
- `AdminDashboard.tsx` — orchestrator (like `PhotoGallery.tsx` pattern)
- `PipelineControls.tsx` — phase buttons and full pipeline trigger
- `StatusCards.tsx` — processing status overview
- `FolderBreakdown.tsx` — per-folder stats
- `ActivityLog.tsx` — pipeline activity feed
- `DuplicateManager.tsx` — phash duplicate review
- `useAdminPipeline.ts` — hook for pipeline state and actions
- `useAdminStatus.ts` — hook for status polling

**MIT relevance:** This mirrors their smoot-design component library pattern. Each component is testable, documentable, and reusable.

**Commit:** `refactor(admin): decompose dashboard into focused components + hooks`

#### 2.2 Standardize API Response Patterns
Current API routes have inconsistent error handling and response shapes. Establish:
```typescript
// Consistent success response
{ data: T, meta?: { total, hasMore, cached } }

// Consistent error response
{ error: string, code?: string, details?: unknown }
```
Create a `src/lib/api-utils.ts` with `successResponse()`, `errorResponse()`, `withErrorHandler()` wrapper.

**MIT relevance:** Maps to their drf-spectacular OpenAPI pattern — consistent, documentable API contracts.

**Commit:** `refactor(api): standardize response shapes and error handling`

#### 2.3 Improve Type Definitions
- Add JSDoc comments to all interfaces in `types.ts` explaining the domain model
- Add discriminated unions where appropriate (e.g., pipeline phase results)
- Create `src/lib/pipeline/types.ts` improvements with proper phase state types

**MIT relevance:** Type annotations are explicitly called out in their engineering values.

**Commit:** `refactor(types): add JSDoc documentation and improve type precision`

#### 2.4 Extract Hardcoded Strings
Create `src/lib/strings.ts` for all user-facing copy:
```typescript
export function getStrings(config: EventLensConfig) {
  return {
    loginTitle: config.eventName || "Event Photos",
    loginSubtitle: config.eventTagline || "Find your photos",
    searchPlaceholder: `Search ${config.eventName} photos...`,
    // ...
  };
}
```
Replace hardcoded "PHOTO RECONNAISSANCE SYSTEM", "OPERATIVES", "VISUAL RECON" etc.

**Commit:** `refactor: extract hardcoded UI strings to configurable strings module`

#### 2.5 Add Error Boundaries and Loading States
- Verify `ErrorBoundary` is used at appropriate levels (it exists but check coverage)
- Add proper loading skeletons for admin dashboard
- Add empty state components where missing

**Commit:** `feat(ui): improve error boundary coverage and loading states`

---

### Phase 3: RFC & Documentation (The Interview Artifacts)

**Goal:** Write the documents that demonstrate architectural thinking. These are as important as the code itself for the interview.

#### 3.1 ARCHITECTURE.md — RFC-Style Design Document

Write in the style MIT Open Learning uses for internal RFCs. Structure:

1. **Problem Statement** — Event photographers dump thousands of photos in a folder. Attendees can't find themselves. Organizers need a gallery that's searchable by face, by description, and by text — deployed in minutes, not weeks.

2. **Goals and Non-Goals**
   - Goal: Any event organizer deploys a searchable AI gallery by pointing at a Drive folder
   - Goal: Face matching, semantic search, and text search work across thousands of photos
   - Goal: Process photos within Vercel serverless constraints (300s timeout)
   - Non-goal: Real-time photo upload during events (Drive is the source of truth)
   - Non-goal: User accounts for attendees (password gate is sufficient)

3. **Architecture Decisions**
   - *Why Google Drive as storage:* Zero-cost photo hosting, organizers already use it, CDN thumbnails via `lh3.googleusercontent.com` are free and fast, no S3 bills
   - *Why pgvector over dedicated vector DB:* Single database for relational + vector data, Supabase gives us both PostgreSQL and pgvector with no additional infrastructure, HNSW indexes give sub-50ms similarity search at our scale
   - *Why two embedding spaces:* Face recognition (512-dim InsightFace) and semantic search (768-dim Gemini) solve fundamentally different problems. Face embeddings capture geometric facial features; text embeddings capture scene semantics. Merging them into one space would degrade both.
   - *Why serverless pipeline with wall-clock guards:* Vercel's 300s limit means long pipelines must be interruptible and resumable. Each phase processes items in a loop, checks elapsed time at 250s, returns progress. The client re-calls until done. This is effectively a poor man's job queue that works without additional infrastructure.
   - *Why CDN-first image strategy:* Google Drive's `lh3.googleusercontent.com` thumbnails are free, fast, and don't count against API quota. Direct Drive API downloads are the fallback. This reduces API costs by ~90% for the gallery view.
   - *Why hybrid search (vector + full-text + trigram):* Pure vector search misses exact text matches (badge names, slide content). Pure text search misses semantic meaning ("outdoor group photo"). The hybrid approach catches both, with results merged by weighted scoring.

4. **Data Model** — Schema diagram with all tables, indexes, and RPC functions. Explain the progression from 001 to 012 migrations.

5. **Pipeline Design** — Detailed flow of scan → describe → embed → face-embed → phash with error recovery, rate limiting, and wall-clock guards.

6. **Search Architecture** — How semantic search, face matching, and text search each work, and how hybrid results are merged.

7. **Future: Multi-Tenant Evolution** — How the architecture extends to multi-tenant SaaS (events table, event_id scoping, distributed rate limiting).

8. **Tradeoffs and Open Questions**
   - API key auth vs OAuth for Drive (simplicity vs private folder support)
   - InsightFace as separate service vs ONNX in Node (deployment friction vs simplicity)
   - In-memory rate limiter limitations in serverless (adequate for single-tenant, needs distributed solution for multi-tenant)

**Commit:** `docs: add ARCHITECTURE.md RFC-style design document`

#### 3.2 Polish README
Update for both audiences (clients and Peter):
- Product-grade feature description (already strong)
- Clean architecture diagram
- Quick-start that actually works
- Link to ARCHITECTURE.md for design decisions
- Acknowledge AI pair programming (190 commits with `.claude` directory)

**Commit:** `docs: polish README for product and portfolio audiences`

#### 3.3 Inline Documentation
Add comments explaining "why" (not "what") at key architectural decision points:
- Why the wall-clock guard is 250s (not 280 or 290)
- Why face embeddings use a separate table (not a column on photos)
- Why the CDN URL pattern uses `=s800` sizing
- Why `timingSafeEqual` matters for password comparison
- Why we batch embeddings at 100 per request (Gemini's limit)

**Commit:** `docs: add inline comments at key architectural decision points`

---

### Phase 4: Product Hardening (SaaS-Ready)

**Goal:** Everything a paying client needs. Security, configuration, deployment.

#### 4.1 Auth Overhaul

**Current state:** Cookie is `auth=true` (forgeable). Passwords are plaintext env vars.

**Target:**
- Bcrypt-hashed passwords stored in a `settings` table in Supabase
- Signed session cookies using `iron-session` or `jose` JWT
- Rate limiting on login: 5 attempts/min per IP
- First-run detection: if no `setup_complete` flag, redirect to `/admin/setup`

**Implementation:**
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

`config.ts` becomes async: check DB first, then env vars, then defaults. Cache in memory per-request.

**Commit sequence:**
1. `feat(db): add settings table migration`
2. `feat(auth): replace plaintext passwords with bcrypt hashed DB storage`
3. `feat(auth): replace boolean cookie with signed session tokens`
4. `feat(auth): add rate limiting on login endpoints`

#### 4.2 Setup Wizard

Build `/admin/setup` — a multi-step wizard that replaces manual `.env.local` editing.

**Steps:**
1. **Admin password creation** — bcrypt hash stored in settings table
2. **API key entry with inline validation**
   - Google API Key → validate via Drive API `about` endpoint
   - Drive Folder ID → validate by listing subfolders, show folder name + count
   - Gemini API Key → validate with lightweight generate call
   - Supabase URL + Service Role Key → validate with health check
   - Face API URL + Secret (optional) → validate via `/health` ping
3. **Event configuration** — name, year, tagline, colors (hex pickers with live preview)
4. **Audience password** — what attendees use to access the gallery
5. **Confirmation + First Sync** — summary card, then "Sync Photos" triggers the pipeline

**Commit sequence:**
1. `feat(admin): setup wizard UI with multi-step form`
2. `feat(admin): API key validation endpoints`
3. `feat(admin): first-run detection in middleware`

#### 4.3 Dynamic Theming

**Current:** ~50 hardcoded CSS vars based on green/magenta.

**Target:** Generate full opacity palette from user's chosen colors at runtime.

In `layout.tsx`:
```tsx
const [r, g, b] = hexToRgb(primaryColor);
// Generate --el-primary-08 through --el-primary-99 as rgba values
```

Global find-replace: `var(--el-green` → `var(--el-primary`, `var(--el-magenta` → `var(--el-secondary`.

Fix inline SVG cursors and glow effects that use hardcoded rgba values.

**Commit sequence:**
1. `refactor(css): replace hardcoded color palette with dynamic CSS custom properties`
2. `refactor(ui): update all component color references to use dynamic palette`

#### 4.4 Rate Limiting for API Endpoints
- `/api/auth/login` — 5/min per IP
- `/api/match` — 10/min per IP (expensive: calls InsightFace)
- `/api/search` — 30/min per IP (calls Gemini embeddings)
- `/api/admin/*` — 60/min per token
- Use in-memory token bucket (adequate for single-tenant on Vercel)

**Commit:** `feat(api): add rate limiting to auth, match, search, and admin endpoints`

---

### Phase 5: Multi-Tenant SaaS Transformation

**Goal:** Any organizer signs up, connects their Drive, and gets a gallery. No developer involved.

This is the largest phase. It touches every layer of the stack.

#### 5.1 Events Table — The Foundation

Everything else depends on this. The `events` table becomes the central entity.

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,              -- URL-friendly identifier
  owner_id UUID REFERENCES auth.users,    -- Supabase Auth
  name TEXT NOT NULL,
  tagline TEXT,
  year TEXT,

  -- Drive config (per-event)
  drive_folder_id TEXT NOT NULL,
  google_api_key TEXT NOT NULL,           -- encrypted
  gemini_api_key TEXT NOT NULL,           -- encrypted

  -- Branding
  primary_color TEXT DEFAULT '#3b82f6',
  secondary_color TEXT DEFAULT '#f59e0b',
  accent_color TEXT DEFAULT '#3b82f6',

  -- Access
  password_hash TEXT NOT NULL,            -- bcrypt for attendee access

  -- Quotas
  plan TEXT DEFAULT 'free',               -- free | pro | enterprise
  max_photos INT DEFAULT 500,
  embedding_quota INT DEFAULT 1000,
  embedding_used INT DEFAULT 0,
  rpm_limit INT DEFAULT 15,               -- Gemini RPM allocation

  -- Pipeline state
  last_synced_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,           -- updated on gallery views
  sync_interval_minutes INT DEFAULT 5,
  pipeline_status JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_slug ON events (slug);
CREATE INDEX idx_events_owner ON events (owner_id);
```

**Commit:** `feat(db): add events table for multi-tenant foundation`

#### 5.2 Add event_id to All Data Tables

```sql
-- Photos
ALTER TABLE photos ADD COLUMN event_id UUID REFERENCES events(id);
CREATE INDEX idx_photos_event ON photos (event_id);

-- Face embeddings
ALTER TABLE face_embeddings ADD COLUMN event_id UUID REFERENCES events(id);
CREATE INDEX idx_face_embeddings_event ON face_embeddings (event_id);

-- Match sessions
ALTER TABLE match_sessions ADD COLUMN event_id UUID REFERENCES events(id);
CREATE INDEX idx_match_sessions_event ON match_sessions (event_id);
```

**Commit:** `feat(db): add event_id foreign key to photos, face_embeddings, match_sessions`

#### 5.3 Update All RPC Functions

Every RPC function needs an `event_id` parameter added to its WHERE clause:

- `match_faces(query_embedding, match_threshold, match_count, p_event_id)` — add `AND fe.event_id = p_event_id`
- `search_photos(search_query, p_event_id)` — add `AND p.event_id = p_event_id`
- `search_photos_semantic(query_embedding, match_threshold, match_count, p_event_id)` — add `AND p.event_id = p_event_id`
- `find_duplicate_clusters(hamming_threshold, p_event_id)` — add `AND a.event_id = p_event_id`

**Commit:** `feat(db): scope all RPC functions by event_id`

#### 5.4 Thread Event Context Through the Stack

**Config layer:** Replace the singleton `config` object with an async `getEventConfig(eventId)` that reads from the events table. Env vars become the fallback for backward compatibility.

```typescript
// src/lib/config.ts
export async function getEventConfig(eventId: string): Promise<EventConfig> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!data) throw new Error(`Event not found: ${eventId}`);
  return mapEventToConfig(data);
}
```

**API routes:** Each route resolves the event from the URL slug or a header, then passes it through.

**Pipeline phases:** Every phase function receives `eventId` and uses it for all DB queries and Drive API calls.

**Supabase client:** All RPC calls in `supabase.ts` get an `eventId` parameter.

**Commit sequence:**
1. `refactor(config): replace singleton config with async per-event config`
2. `refactor(api): thread event context through all API routes`
3. `refactor(pipeline): thread event_id through all pipeline phases`
4. `refactor(supabase): add event_id parameter to all RPC wrapper functions`

#### 5.5 Event-Scoped Routing

**Attendee routes:** `/e/[slug]` — resolves event by slug, serves gallery
**Organizer routes:** `/dashboard/[eventId]` — requires Supabase Auth, serves admin
**Auth:** `/e/[slug]/login` — per-event password gate

The middleware resolves the slug from the URL, loads the event config, and injects it into the request context.

**Commit:** `feat(routing): add event-scoped routes for attendees and organizers`

#### 5.6 Organizer Authentication

Replace the single `ADMIN_API_SECRET` with Supabase Auth:
- Organizers sign up with email/password
- Each event has an `owner_id` linking to `auth.users`
- The dashboard checks that the logged-in user owns the event
- Future: team members with role-based access

**Commit:** `feat(auth): add Supabase Auth for organizer accounts`

#### 5.7 Distributed Rate Limiter

Replace the in-memory `RateLimiter` with a Supabase RPC-based token bucket:

```sql
CREATE TABLE rate_limit_buckets (
  key TEXT PRIMARY KEY,               -- e.g., 'gemini:event_abc123'
  tokens NUMERIC NOT NULL,
  max_tokens NUMERIC NOT NULL,
  refill_rate NUMERIC NOT NULL,       -- tokens per second
  last_refill TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key TEXT,
  p_tokens NUMERIC DEFAULT 1,
  p_max_tokens NUMERIC DEFAULT 30,
  p_refill_rate NUMERIC DEFAULT 0.5
) RETURNS BOOLEAN AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_bucket rate_limit_buckets%ROWTYPE;
  v_elapsed NUMERIC;
  v_new_tokens NUMERIC;
BEGIN
  -- Upsert bucket
  INSERT INTO rate_limit_buckets (key, tokens, max_tokens, refill_rate, last_refill)
  VALUES (p_key, p_max_tokens, p_max_tokens, p_refill_rate, v_now)
  ON CONFLICT (key) DO NOTHING;

  -- Lock and refill
  SELECT * INTO v_bucket FROM rate_limit_buckets WHERE key = p_key FOR UPDATE;
  v_elapsed := EXTRACT(EPOCH FROM v_now - v_bucket.last_refill);
  v_new_tokens := LEAST(v_bucket.max_tokens, v_bucket.tokens + v_elapsed * v_bucket.refill_rate);

  IF v_new_tokens >= p_tokens THEN
    UPDATE rate_limit_buckets
    SET tokens = v_new_tokens - p_tokens, last_refill = v_now
    WHERE key = p_key;
    RETURN TRUE;
  ELSE
    UPDATE rate_limit_buckets
    SET tokens = v_new_tokens, last_refill = v_now
    WHERE key = p_key;
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Why this works for multi-tenant:** The token bucket is shared across all serverless invocations. Each event gets its own bucket keyed by `gemini:event_{id}`. A global bucket `gemini:global` enforces the overall API limit. The pipeline checks both before making a Gemini call.

**Commit:** `feat(pipeline): distributed rate limiter via Supabase token bucket`

#### 5.8 Activity-Based Cron Scheduling

Replace the single global cron with event-aware scheduling:

```typescript
// /api/admin/index (cron handler)
export async function GET() {
  const { data: events } = await supabase
    .from('events')
    .select('id, last_activity_at, last_synced_at, sync_interval_minutes')
    .not('drive_folder_id', 'is', null);

  for (const event of events) {
    const timeSinceActivity = Date.now() - new Date(event.last_activity_at).getTime();
    const timeSinceSync = Date.now() - new Date(event.last_synced_at).getTime();
    const intervalMs = event.sync_interval_minutes * 60 * 1000;

    // Only sync events with recent activity OR overdue for sync
    const isActive = timeSinceActivity < 7 * 24 * 60 * 60 * 1000; // 7 days
    const isDue = timeSinceSync > intervalMs;

    if (isActive && isDue) {
      await triggerSync(event.id);
    }
  }
}
```

**Cost impact:** Reduces Drive API calls by ~80% by not syncing stale events every 5 minutes.

**Commit:** `feat(pipeline): activity-based cron scheduling for multi-tenant sync`

#### 5.9 Dynamic Theming Per Event

Each event stores its colors in the events table. The middleware reads them and injects CSS custom properties into the response. The gallery renders with the event's branding.

**Commit:** `feat(ui): per-event dynamic theming from events table`

---

## Multi-Tenant Cost Analysis

### Drive API (10,000 queries/100s, 1B/day)

Per sync cycle per event: ~12 API calls (1 subfolder list + 1 file list per subfolder + 1 root list, typical 10-subfolder event). At 5-minute cron: ~3,456 calls/day per event.

| Scale | Naive (5-min sync all) | Optimized (activity-based) |
|-------|----------------------|---------------------------|
| 10 events | ~35K/day | ~5K/day |
| 50 events | ~173K/day | ~20K/day |
| 200 events | ~691K/day | ~70K/day |

All within quota. The optimization is about not wasting calls on dead events.

### Gemini API

Vision analysis (describe phase): ~$0.01/image. A 500-photo event = ~$5 one-time. Text embeddings are essentially free tier.

The 30 RPM limit is the bottleneck for concurrent events. With the distributed rate limiter, 3 events processing simultaneously each get ~10 RPM effective, tripling processing time. Cost doesn't change — it's a throughput problem.

Per-event quota caps (`max_photos` per plan tier) prevent runaway costs.

### Railway (InsightFace face-api)

~$50/month always-on (1.5GB RAM). Single instance, processes one image at a time with 300ms delay. 30-60s cold start.

**Scale-to-zero:** Drops to ~$15/month for bursty workloads. Events are processed once, then rarely need face-embed again.

**Queue pattern:** Instead of multiple events hitting face-api simultaneously, maintain a queue table. Cron pulls next N images across all events, processes sequentially with fair-share.

### Vercel Serverless

| Approach | Invocations/day | GB-hours/day |
|----------|----------------|--------------|
| Fan-out (1 invocation per event per cron) | 14,400 at 50 events | ~1,200 |
| Sequential (round-robin in single cron) | 288 regardless of event count | ~24 |

**Recommendation:** Stay sequential until revenue justifies fan-out.

---

## Feature Backlog (Post-SaaS)

These are documented feature specs from the hackathon, ready to implement:

### Auto-Albums (CLAUDE-AUTOALBUMS.md)
K-means clustering on existing 768-dim embeddings → thematic album filter chips. ~5-10 Gemini calls total (one per cluster for naming). Zero cost for basic version.

### Collage Maker (CLAUDE-COLLAGE.md)
Sharp server-side compositing from selected photos. Grid layout algorithm, optional Gemini hero pick. Already partially implemented.

### Perceptual Hash Deduplication (CLAUDE-DEDUP.md)
dHash 64-bit fingerprinting for burst/re-upload detection. Admin review UI for duplicate clusters. Zero API cost — pure pixel math + SQL. Already implemented (migration 010).

### Performance Optimizations (PERF-PROMPTS.md)
Four targeted fixes: lazy-load images, progressive rendering via IntersectionObserver, cap stagger animations, paginate API. Already partially implemented (progressive render is live).

---

## Implementation Order

The phases above are ordered by dependency and risk. Here's the recommended execution sequence within each phase, with rough time estimates:

### Sprint 1: Foundation + Documentation (Week 1)
- Phase 1.1–1.5 (repo hygiene) — 1 day
- Phase 3.1 (ARCHITECTURE.md) — 2 days
- Phase 3.2–3.3 (README + inline docs) — 1 day

### Sprint 2: Interview-Ready Code (Week 2)
- Phase 2.1 (admin decomposition) — 1 day
- Phase 2.2 (API response patterns) — 0.5 day
- Phase 2.3 (type improvements) — 0.5 day
- Phase 2.4 (extract strings) — 0.5 day
- Phase 2.5 (error boundaries) — 0.5 day

### Sprint 3: Product Hardening (Week 3)
- Phase 4.1 (auth overhaul) — 2 days
- Phase 4.2 (setup wizard) — 2 days
- Phase 4.3 (dynamic theming) — 1 day

### Sprint 4: Multi-Tenant Core (Week 4-5)
- Phase 5.1 (events table) — 0.5 day
- Phase 5.2 (event_id columns) — 0.5 day
- Phase 5.3 (RPC updates) — 1 day
- Phase 5.4 (thread event context) — 2 days
- Phase 5.5 (event-scoped routing) — 1 day

### Sprint 5: Multi-Tenant Infrastructure (Week 5-6)
- Phase 5.6 (organizer auth) — 1 day
- Phase 5.7 (distributed rate limiter) — 1 day
- Phase 5.8 (activity-based cron) — 0.5 day
- Phase 5.9 (per-event theming) — 0.5 day
- Phase 4.4 (API rate limiting) — 0.5 day

---

## Working Principles

These apply to all phases:

1. **Always explain before implementing.** Present current state, what's wrong, 2-3 options, tradeoffs. Let Sonia choose.

2. **Teach as you go.** When refactoring, explain the principle so it can be discussed in interview context.

3. **Flag MIT-relevant patterns.** When a refactor aligns with something in mit-learn (OpenAPI, design system, search architecture, component composition), call it out.

4. **Commit-sized changes.** Each change is a logical unit that can be reviewed and understood independently.

5. **Don't over-engineer.** This is a small, focused product. Keep it proportional. The goal is demonstrating good judgment about *when* to engineer and when to keep it simple.

---

## Reference: Current File Structure

```
src/
├── app/
│   ├── page.tsx                        # 17 lines — delegates to PhotoGallery
│   ├── login/page.tsx                  # Password login
│   ├── admin/page.tsx                  # Admin dashboard (626 lines — decompose in Phase 2)
│   ├── layout.tsx                      # Root layout with fonts + theme
│   ├── globals.css                     # Tailwind + CSS custom properties
│   └── api/
│       ├── photos/route.ts             # Photo list with pagination
│       ├── search/route.ts             # Hybrid semantic + full-text search
│       ├── match/route.ts              # Face matching via pgvector
│       ├── stats/route.ts              # Gallery analytics
│       ├── video/route.ts              # Drive video streaming proxy
│       ├── download-zip/route.ts       # Batch ZIP export
│       ├── collage/route.ts            # Server-side collage generation
│       ├── auth/login|logout/route.ts  # Cookie-based auth
│       └── admin/                      # Pipeline orchestration + management
├── components/
│   ├── gallery/                        # 15 decomposed gallery components
│   │   ├── PhotoGallery.tsx            # Main orchestrator
│   │   ├── GalleryHeader.tsx, FolderTabs.tsx, TagTabs.tsx, ...
│   │   └── 8 custom hooks (usePhotos, useSearch, useFilters, ...)
│   ├── Lightbox.tsx, PhotoUpload.tsx, FloatingActionBar.tsx, ...
├── lib/
│   ├── config.ts                       # Singleton config (→ async per-event in Phase 5)
│   ├── types.ts                        # TypeScript interfaces
│   ├── drive.ts, gemini.ts, supabase.ts, auth.ts, photos.ts
│   └── pipeline/
│       ├── rate-limiter.ts             # In-memory (→ distributed in Phase 5)
│       ├── retry.ts, gemini-client.ts, face-api-client.ts
│       ├── supabase-store.ts, phash.ts, drive-client.ts
│       └── phases/ (sync, scan, describe, embed, face-embed, phash)
├── middleware.ts
services/face-api/                       # InsightFace Flask microservice
supabase/migrations/                     # 12 SQL migrations
```

---

## Reference: Existing Planning Documents

- `PLAN.md` — Original project status and feature backlog
- `CLAUDE-AUTOALBUMS.md` — Auto-albums feature spec (5 commits)
- `CLAUDE-COLLAGE.md` — Collage feature spec (5 commits)
- `CLAUDE-DEDUP.md` — Deduplication feature spec (5 commits)
- `PERF-PROMPTS.md` — Performance optimization prompts (4 targeted fixes)
- `TEMPLATE-REVIEW.md` — Full template conversion code review
