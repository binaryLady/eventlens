# EventLens: Refactor & Portfolio Master Plan

**Author:** Sonia / @TheTechMargin
**Date:** March 14, 2026
**Updated:** March 15, 2026
**Status:** Active

---

## Purpose

This document is the single source of truth for the EventLens refactor. It serves two simultaneous goals:

1. **Portable tool** — Transform EventLens from a single-event hackathon project into a lightweight, customizable tool that any event organizer can deploy by providing their own keys and Drive folder. The app is intentionally ephemeral — an event gallery doesn't need to stay live forever, it just needs to work for the time the organizers decide to keep it up.

2. **Portfolio piece** — Prepare the codebase as a code sample for a Senior Product Engineer interview at MIT Open Learning. The code, architecture, and documentation should demonstrate ownership, design thinking, and production-quality engineering.

Every refactor decision should pass both filters: "Would an organizer deploying this benefit from this?" and "Can I explain the reasoning behind this in a technical interview?"

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

Search is genuinely sophisticated. Hybrid semantic (768-dim Gemini embeddings via pgvector cosine similarity) + full-text (tsvector) + trigram matching, merged and ranked. Face matching uses separate 512-dim InsightFace embeddings with tiered confidence. Co-occurrence recommendations surface photos where matched faces appear together.

12 Supabase migrations show progressive schema evolution. Feature specs (CLAUDE-AUTOALBUMS.md, CLAUDE-COLLAGE.md, CLAUDE-DEDUP.md) document the development process.

### What Needs Work

**Auth is a security liability.** The auth cookie is literally `auth=true` — a boolean with no signature, no session token, no CSRF protection. `APP_PASSWORD` and `ADMIN_API_SECRET` are plaintext env vars compared via `timingSafeEqual`. This works for a hackathon but needs improvement.

**No setup UI.** A client would need to manually edit `.env.local`, run 12 SQL migrations, deploy a Flask microservice, configure API keys across 4 services. Developer experience, not customer experience.

**Theming is hardcoded.** `globals.css` has ~50 CSS custom properties all based on `#00ff41` (matrix green) and `#ff00ff` (magenta). The layout injects `--color-primary` from env vars, but almost nothing in the CSS actually uses those variables.

**Admin dashboard** — ✅ Decomposed from 626-line monolith into 4 hooks + 8 components (93-line orchestrator).

**Rate limiting is in-memory.** The `RateLimiter` class uses a `timestamps: number[]` array that dies with each serverless invocation. Adequate for single-event processing but not for concurrent use.

---

## Phase Guide

### Phase 0: Audit & Understanding (No Code Changes)

**Goal:** Map every file, every data flow, every dependency. Identify hackathon shortcuts, security issues, and architectural debt.

**Deliverable:** This document (done). Plus deep familiarity with every architectural decision so Sonia can speak to them fluently.

**Key files to internalize:**

| File | What it does | Interview angle |
|------|-------------|-----------------|
| `src/lib/config.ts` | Singleton config from env vars | How config works, what's customizable |
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

#### 1.1 Remove Dead Google Sheets References — DONE
- ✅ Deleted `sheetId` from `EventLensConfig` interface and `config` object in `config.ts`
- ✅ Removed `GOOGLE_SHEET_ID` from `.env.example`
- ✅ Removed `fetchPhotos()` Google Sheets function from `photos.ts`

#### 1.2 Clean Up .env.example — DONE
- ✅ Removed `GOOGLE_SHEET_ID`
- ✅ Added missing `NEXT_PUBLIC_SECONDARY_COLOR`
- ✅ Added comments explaining which vars are required vs optional
- ✅ Grouped by service (Google, Gemini, Supabase, Auth, Face API, Branding)

#### 1.3 Verify .gitignore Coverage
- Confirm `.env.local`, `.env`, `node_modules`, `.next`, any credential files are excluded
- Add `services/face-api/__pycache__/` if missing
- **Commit:** `chore: tighten .gitignore coverage`

#### 1.4 TypeScript Strictness Check
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

#### 3.1 ARCHITECTURE.md — DONE
- ✅ 9-section RFC: Problem Statement, Goals & Non-Goals, Architecture Decisions, Data Model, Pipeline Design, Search Architecture, Component Architecture, Tradeoffs, Future.

#### 3.2 Polish README — DONE
- ✅ Added Design Decisions section linking to ARCHITECTURE.md
- ✅ Added Development Process section on AI pair programming workflow
- ✅ Cleaned up env vars table (removed dead GOOGLE_SHEET_ID)

#### 3.3 Inline Documentation
Add comments explaining "why" (not "what") at key architectural decision points:
- Why the wall-clock guard is 250s (not 280 or 290)
- Why face embeddings use a separate table (not a column on photos)
- Why the CDN URL pattern uses `=w640` sizing
- Why `timingSafeEqual` matters for password comparison
- Why we batch embeddings at 100 per request (Gemini's limit)

**Commit:** `docs: add inline comments at key architectural decision points`

---

### Phase 4: Product Hardening (Portable Tool Ready)

**Goal:** Everything an organizer needs to deploy this for their event.

#### 4.1 Auth Improvement

**Current state:** Cookie is `auth=true` (forgeable). Passwords are plaintext env vars.

**Target:**
- Signed session cookies using `iron-session` or `jose` JWT
- Rate limiting on login: 5 attempts/min per IP
- Keep env-var-based password (appropriate for a portable tool where the organizer controls the deployment)

**Commit sequence:**
1. `feat(auth): replace boolean cookie with signed session tokens`
2. `feat(auth): add rate limiting on login endpoints`

#### 4.2 Setup Wizard

Build `/admin/setup` — a guided first-run experience that validates configuration.

**Steps:**
1. **API key validation** — verify Google API Key, Drive Folder ID, Gemini API Key, Supabase credentials
2. **Event configuration** — name, year, tagline, colors (with live preview)
3. **Face-api health check** (optional) — verify Railway service is reachable
4. **First sync trigger** — run the pipeline from the setup flow

**Commit sequence:**
1. `feat(admin): setup wizard UI with validation`
2. `feat(admin): first-run detection in middleware`

#### 4.3 Dynamic Theming

**Current:** ~50 hardcoded CSS vars based on green/magenta.

**Target:** Generate full opacity palette from user's chosen colors at runtime.

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

**Commit:** `feat(api): add rate limiting to auth, match, search, and admin endpoints`

---

## Feature Backlog (Future)

These are documented feature specs from the hackathon, ready to implement:

### Auto-Albums (CLAUDE-AUTOALBUMS.md)
K-means clustering on existing 768-dim embeddings → thematic album filter chips. ~5-10 Gemini calls total (one per cluster for naming). Zero cost for basic version.

### Collage Maker (CLAUDE-COLLAGE.md)
Sharp server-side compositing from selected photos. Grid layout algorithm, optional Gemini hero pick. Already partially implemented.

### Perceptual Hash Deduplication (CLAUDE-DEDUP.md)
dHash 64-bit fingerprinting for burst/re-upload detection. Admin review UI for duplicate clusters. Zero API cost — pure pixel math + SQL. Already implemented (migration 010).

### Performance Optimizations (PERF-PROMPTS.md)
Four targeted fixes: lazy-load images, progressive rendering via IntersectionObserver, cap stagger animations, paginate API. Already partially implemented (progressive render is live).

### Four Corners Metadata Generation
Leverage the Gemini Vision pipeline to bulk-generate Four Corners metadata for photographers. Uses the same `visible_text`, `people_descriptions`, and `scene_description` output. See: [github.com/The-Tech-Margin/four-corners-metadata-generator](https://github.com/The-Tech-Margin/four-corners-metadata-generator)

### Social Features
- Posting to social from the app
- Likes and share counts
- Shareable photo/collage links

---

## Implementation Order

### Sprint 1: Foundation + Documentation (Weekend — before Monday)
- ✅ Phase 1.1 (remove dead Google Sheets)
- ✅ Phase 1.2 (clean .env.example)
- ✅ Phase 1.3 (.gitignore verified — secrets excluded)
- ✅ Phase 2.1 (admin decomposed: 4 hooks + 8 components)
- ✅ Phase 3.1 (ARCHITECTURE.md — full 9-section RFC)
- ✅ Phase 3.2 (README polish)
- ✅ Pipeline tests (52 tests, 6 co-located test files, Jest)
- ✅ GitHub Actions CI workflow (test → typecheck → lint → build)
- ✅ Drive pagination verified (nextPageToken loop already in place)

### Sprint 2: Interview-Ready Code (Week 2)
- Phase 2.2 (API response patterns) — 0.5 day
- Phase 2.3 (type improvements) — 0.5 day
- Phase 2.4 (extract strings) — 0.5 day
- Phase 2.5 (error boundaries) — 0.5 day
- Phase 3.3 (inline docs) — 0.5 day

### Sprint 3: Product Hardening (Week 3-4)
- Phase 4.1 (auth improvement) — 1 day
- Phase 4.2 (setup wizard) — 2 days
- Phase 4.3 (dynamic theming) — 1 day
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

## Reference: Existing Planning Documents

- `ARCHITECTURE.md` — RFC-style design document (the interview artifact)
- `CLAUDE-AUTOALBUMS.md` — Auto-albums feature spec (5 commits)
- `CLAUDE-COLLAGE.md` — Collage feature spec (5 commits)
- `CLAUDE-DEDUP.md` — Deduplication feature spec (5 commits)
- `PERF-PROMPTS.md` — Performance optimization prompts (4 targeted fixes)
- `TEMPLATE-REVIEW.md` — Full template conversion code review
