# EventLens Template Conversion — Code Review

**Reviewer:** Claude // March 12, 2026
**Scope:** Full codebase audit for converting EventLens into a purchasable, self-service template

---

## Executive Summary

EventLens is a sophisticated, production-quality event photo app with AI face matching, semantic search, and admin pipeline orchestration. The core product works. But converting it to a template that a buyer can install on *any* Google Drive folder requires significant changes to the setup flow, configuration architecture, theming system, and deployment model. This review focuses on what needs to change and how.

---

## 1. SETUP WIZARD — The Missing Piece (P0)

Right now there is no guided setup. A buyer would need to manually edit `.env.local`, run Supabase migrations, deploy a Python microservice, set up a venv, and know which API keys to create. That's a developer experience, not a customer experience.

**What to build: `/admin/setup` — a multi-step wizard that runs once.**

### Step 1: Admin Password Creation
The buyer creates their admin password on first visit. This replaces the current `ADMIN_API_SECRET` env var pattern. Store a bcrypt hash in the database (not a plaintext env var comparison). Right now `auth.ts` does a `timingSafeEqual` against a raw string from `process.env` — that's fine for a bespoke deploy but not for a template where the customer shouldn't touch env files.

### Step 2: API Key Entry
A form that collects and validates:
- **Google API Key** — validate by hitting `https://www.googleapis.com/drive/v3/about?fields=user&key=KEY` and checking for 200
- **Google Drive Folder ID** — validate by listing subfolders with the provided key, show folder name + subfolder count as confirmation
- **Gemini API Key** — validate with a lightweight generate call
- **Supabase URL + Service Role Key** — validate with a simple `select 1` or health check
- **Face API URL + Secret** (optional) — validate with a ping to the `/health` endpoint

Each field should show green check / red X inline as the user fills them in. Store validated keys in a `config` table in Supabase (encrypted at rest via Supabase's built-in encryption, or use Vercel env vars API if self-hosted on Vercel).

### Step 3: Event/Collection Configuration
- Event name, year, tagline
- Primary, secondary, tertiary color pickers (hex + visual preview)
- Logo upload (optional)

### Step 4: Audience Password
The buyer sets the password their attendees will use. Currently this is `APP_PASSWORD` in env — same issue as admin, should be hashed in the database.

### Step 5: Confirmation + First Sync
Show a summary card of all settings, then a big "Sync Photos" button that triggers the scan + full pipeline. Show real-time progress inline.

**Storage model:** Create a `settings` table in Supabase:
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

API keys stored here with `encrypted = true`. The app reads from this table at startup and caches in memory. The current `config.ts` pattern of reading from `process.env` should become a fallback — check DB first, then env vars, then defaults.

---

## 2. CONFIGURATION ARCHITECTURE — Kill the .env Dependency

### Current Problem
`config.ts` exports a static object reading from `process.env`. Every API route independently reads `process.env.GEMINI_API_KEY`, `process.env.GOOGLE_API_KEY`, etc. The Python pipeline (`process_photos.py`) reads env vars directly too. This means the customer must set 12+ env vars manually.

### Target Architecture

```
settings table (Supabase)
    ↓
/api/internal/config (server-only endpoint, cached)
    ↓
config.ts → getConfig() (async, memoized per-request)
    ↓
All API routes use getConfig() instead of process.env
```

For the Python pipeline, the admin endpoint that spawns it should inject the config values as environment variables into the `spawn()` call — which it already partially does with `env: { ...process.env }` in `pipeline/route.ts`. Extend this to inject DB-sourced config.

### What to Keep in .env
Only infrastructure-level secrets that the *hosting platform* provides:
- `NEXT_PUBLIC_SUPABASE_URL` — needed at build time for the Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — needed to bootstrap the settings table itself
- `NEXTAUTH_SECRET` or equivalent session secret

Everything else moves to the setup wizard / settings table.

---

## 3. THEMING SYSTEM — From Hardcoded to Dynamic (P0)

### Current State
The globals.css has ~50 hardcoded CSS custom properties all based on `#00ff41` (matrix green) and `#ff00ff` (magenta). The layout.tsx injects `--color-primary` and `--color-accent` from env vars, but almost nothing in the CSS actually uses those variables — everything references the hardcoded `--el-green-*` palette.

This means the color picker in the setup wizard would do *nothing* unless the CSS is refactored.

### What to Do

**Replace the hardcoded palette with computed CSS custom properties.** In `layout.tsx`, generate the full opacity palette from the user's chosen colors:

```tsx
// Generate from hex: #3b82f6 → rgb(59, 130, 246)
const [r, g, b] = hexToRgb(primaryColor);
const cssVars = `
  :root {
    --el-primary: ${primaryColor};
    --el-primary-rgb: ${r}, ${g}, ${b};
    --el-primary-08: rgba(${r}, ${g}, ${b}, 0.03);
    --el-primary-11: rgba(${r}, ${g}, ${b}, 0.07);
    --el-primary-22: rgba(${r}, ${g}, ${b}, 0.13);
    --el-primary-33: rgba(${r}, ${g}, ${b}, 0.2);
    --el-primary-44: rgba(${r}, ${g}, ${b}, 0.27);
    --el-primary-66: rgba(${r}, ${g}, ${b}, 0.4);
    --el-primary-99: rgba(${r}, ${g}, ${b}, 0.8);
    /* ... same pattern for secondary and accent */
  }
`;
```

Then do a global find-and-replace in CSS/components: `var(--el-green` → `var(--el-primary`. Same for magenta → secondary, flame → accent.

**The scan-lines, glow effects, custom cursor, and grid backgrounds** all have hardcoded `rgba(0, 255, 65, ...)` values. These need to use `var(--el-primary-rgb)` too. The custom SVG cursor has inline `fill='%23ff00ff'` — that needs to become a dynamically generated data URI.

**Font choice:** Currently hardcoded to JetBrains Mono + Space Mono + Pacifico. For a template, offer 2-3 preset "moods" (e.g., terminal/hacker, clean/modern, editorial/elegant) that swap font families + base styling. Or let the customer pick from a curated list.

---

## 4. AUTHENTICATION — Hash Passwords, Add First-Run Detection (P1)

### Current Issues

**Password stored as plaintext env var.** `APP_PASSWORD` and `ADMIN_API_SECRET` are compared with `timingSafeEqual` against raw strings from `.env.local`. For a template, passwords should be bcrypt-hashed and stored in the `settings` table.

**Auth cookie is `auth=true`.** The middleware checks `request.cookies.get("auth")?.value === "true"`. This is a boolean cookie with no session token, no expiry rotation, no CSRF protection. Any client that sets a cookie named `auth` with value `true` is authenticated. For a template product, this needs to be a signed JWT or a random session token stored server-side.

**Recommended approach:**
- Use `jose` or `next-auth` for JWT-based sessions
- Store hashed passwords in `settings` table
- Add a `setup_complete` boolean flag — if false, redirect all routes to `/admin/setup`
- Add rate limiting on login endpoints (currently none — brute-forceable)

### First-Run Detection
Add to middleware:
```ts
if (!setupComplete && pathname !== '/admin/setup') {
  return NextResponse.redirect(new URL('/admin/setup', request.url));
}
```

Where `setupComplete` is a cached check against the `settings` table (or a simple file/env flag).

---

## 5. GOOGLE DRIVE INTEGRATION — Good Bones, Minor Fixes (P1)

### What Works Well
- `drive.ts` is clean, well-typed, handles CDN + API fallback for image fetching
- Folder discovery via `listDriveSubfolders` properly handles 1-level-deep structure
- The scan endpoint correctly upserts by `drive_file_id`

### Issues

**API key is used for Drive access.** This means the Drive folder must be publicly shared (or shared with "anyone with the link"). The `.env.example` doesn't mention this requirement. The setup wizard should explicitly tell the user: "Make your Google Drive folder publicly viewable (or link-shared) — we access it via API key, not OAuth."

Alternatively, consider offering a Google OAuth flow for private folders. This is more complex but makes the template work with private Drive folders. For v1, API key + public folder is fine — just document it clearly and validate during setup.

**`GOOGLE_SHEET_ID` is still referenced.** `config.ts` includes `sheetId` and `.env.example` lists `GOOGLE_SHEET_ID` as "required" with a comment saying "legacy fallback." Remove it entirely — it's dead code that will confuse template buyers.

**Pagination:** `listDriveImages` doesn't handle `nextPageToken`. If a subfolder has >100 images (Drive API default page size), it silently drops the rest. Add a `while (nextPageToken)` loop.

---

## 6. PIPELINE ARCHITECTURE — Python Dependency is the Elephant (P1)

### The Problem
The processing pipeline is Python (`scripts/process_photos.py`). The admin panel triggers it via `child_process.spawn()`. This works on a VPS but **does not work on Vercel** — serverless functions can't spawn Python subprocesses with a venv.

The `pipeline/route.ts` already detects this and returns a 501 "Pipeline not available in this environment." But for a template product, this is the core functionality — it *must* work in the customer's environment.

### Options

**Option A: Rewrite pipeline in TypeScript (recommended for template).** The pipeline does 5 things: scan Drive, call Gemini, generate embeddings, call face-api, compute phash. All of these have TypeScript equivalents:
- Drive scanning: already in `drive.ts`
- Gemini calls: already in `gemini.ts`
- Embedding generation: already in `search/route.ts`
- Face API calls: HTTP fetch (already done in `match/route.ts`)
- Phash: use `sharp` + a JS dHash implementation

This eliminates the Python dependency entirely. Each phase becomes a Next.js API route that processes images in batches (respecting serverless timeout limits).

**Option B: Keep Python, provide Docker Compose.** Bundle a `docker-compose.yml` that runs the Next.js app + Python worker + face-api service. This works for self-hosted but limits the customer to VPS/Docker deployments.

**Option C: Background jobs via Supabase Edge Functions or Inngest.** Move pipeline processing to a job queue. The admin panel enqueues work, a worker processes it. This is the most production-grade but adds infrastructure complexity.

For a template product targeting non-technical buyers, **Option A is the move.** Kill the Python dependency.

---

## 7. FACE-API MICROSERVICE — Deployment Friction (P2)

The InsightFace Flask service (`services/face-api/`) is a separate deployment. The customer needs to deploy it on Railway/Render/Fly.io, get the URL, and paste it into config. That's a significant barrier.

### Options
- **Bundle as a Vercel serverless function** using ONNX Runtime for Node.js. InsightFace models can run in ONNX format in Node. This eliminates the separate service.
- **Make it optional** (current approach — the app works without face matching). Just make the setup wizard clearly mark it as "Advanced: Face Matching" with a toggle, and provide a one-click Railway deploy button.
- **Offer a hosted face-api as a paid add-on.** You run the service, they pay per-request. Recurring revenue for you, zero friction for them.

---

## 8. DATABASE SETUP — Migrations Need Automation (P1)

### Current State
12 SQL migration files in `supabase/migrations/`. The customer would need to run these manually against their Supabase instance.

### What to Do
Add a `/api/admin/setup/migrate` endpoint that runs migrations programmatically. Use the Supabase service role key to execute raw SQL via the `supabase.rpc()` or direct REST API. Track which migrations have run in a `_migrations` table.

Or better: provide a "Connect to Supabase" button in the setup wizard that takes the project URL + service role key, validates connectivity, and runs all migrations automatically. Show a progress indicator with checkmarks for each migration.

---

## 9. FRONTEND CODE QUALITY (P2)

### `page.tsx` is 1500+ lines
The main gallery page is a monolith. For a template, buyers (or their developers) will want to customize it. Break it into composable components:
- `<GalleryGrid />` — photo grid with virtual scrolling
- `<SearchBar />` — search + filter chips
- `<FolderFilter />` — folder navigation
- `<MatchPanel />` — face matching UI
- `<StatsPanel />` — activity/analytics display

### Hardcoded Copy
Strings like "PHOTO RECONNAISSANCE SYSTEM", "OPERATIVES", "VISUAL RECON" are hardcoded throughout. For a template, all user-facing strings should come from config. Create a `strings.ts` or i18n-light pattern:
```ts
const strings = {
  loginTitle: config.eventName || "Event Photos",
  loginSubtitle: config.eventTagline || "Find your photos",
  searchPlaceholder: `Search ${config.eventName} photos...`,
  // etc.
};
```

### Terminal Aesthetic is Baked In
The entire UI assumes a dark terminal aesthetic — green-on-black, monospace fonts, scan lines, crosshairs. This is *awesome* for a specific vibe but limits the template's market. Consider:
- Keep it as the default "theme"
- Add 2-3 alternate themes (clean/light, dark/modern, editorial)
- Or: position the template specifically as "the hacker-aesthetic event photo app" and own it — niche is fine if you price accordingly

---

## 10. SECURITY AUDIT (P1)

### Good
- `timingSafeEqual` for password comparison — prevents timing attacks
- `httpOnly` + `secure` + `sameSite` on auth cookie
- Security headers in middleware (CSP, X-Frame-Options, nosniff)
- Service role key never exposed to client
- Input validation on pipeline phase parameter

### Needs Fixing

**`.env.local` contains production API keys and is in the repo.** The `.gitignore` likely excludes it, but confirm. For a template, `.env.local` should never ship with real values.

**No rate limiting anywhere.** Login, face matching (which calls expensive APIs), search (which calls Gemini embeddings) — all unlimited. Add rate limiting at minimum to:
- `/api/auth/login` — 5 attempts per minute per IP
- `/api/match` — 10 requests per minute per IP
- `/api/search` — 30 requests per minute per IP
- `/api/admin/*` — 60 requests per minute per token

Use `next-rate-limit` or a simple in-memory token bucket.

**Auth cookie has no HMAC signature.** Anyone can forge `auth=true`. Use `iron-session` or sign the cookie with a secret.

**Admin auth token in client-side state.** The admin page stores the bearer token in React state and sends it with every request. This is fine for the current model but for a template, consider a proper admin session flow (login → session cookie → no bearer token in JS).

**`dangerouslySetInnerHTML` in layout.tsx** for injecting CSS variables. This is safe because the values are hex-validated, but for a template where values come from user input (setup wizard), add strict sanitization. The current `hexColor.test()` regex is good — keep it.

---

## 11. DEPLOYMENT MODEL (P1)

### Current: Vercel + External Services
The app deploys to Vercel but needs: Supabase (database), Railway/Render (face-api), and various Google API keys. That's 4 services to configure.

### Template Options

**One-click Vercel deploy button** — use Vercel's `Deploy with Vercel` feature that can prompt for env vars during deploy. This is the lowest-friction path. The `vercel.json` is already set up. Add a `deploy` button to the README that pre-fills required env vars.

**Supabase project creation link** — link to Supabase with a pre-configured schema. Or provide a "quickstart" SQL file that creates everything in one paste.

**Docker Compose for self-hosted** — bundle everything (Next.js, PostgreSQL + pgvector, face-api) in a single `docker-compose.yml`. One command to run.

---

## 12. SPECIFIC FILE-LEVEL ISSUES

| File | Issue | Fix |
|------|-------|-----|
| `config.ts` | Exports `sheetId` (dead code) | Remove `sheetId` and `GOOGLE_SHEET_ID` references |
| `config.ts` | Synchronous config, can't read from DB | Make `getConfig()` async with caching |
| `.env.example` | Lists `GOOGLE_SHEET_ID` as "required" | Remove it |
| `.env.example` | Missing `NEXT_PUBLIC_SECONDARY_COLOR` | Add it (config.ts references it but .env.example doesn't list it) |
| `middleware.ts` | Cookie `auth=true` is forgeable | Use signed session tokens |
| `pipeline/route.ts` | `maxDuration = 300` but Vercel free tier max is 60s | Document that Pro plan is needed, or batch processing |
| `pipeline/route.ts` | Spawns Python — won't work on Vercel | Rewrite in TS or document limitation |
| `globals.css` | 50+ hardcoded color values | Generate from config primary/secondary/accent |
| `layout.tsx` | Hardcoded font imports (3 Google Fonts) | Make configurable or offer presets |
| `page.tsx` | 1500+ line monolith | Split into 5-6 focused components |
| `supabase.ts` | `createAnonClient()` references unpublished key | Either remove or add to .env.example |
| `admin/page.tsx` | No setup wizard, assumes pre-configured | Add setup flow as described above |
| `drive.ts` | No pagination in `listDriveImages` | Add `nextPageToken` loop |
| `process_photos.py` | Entire file is a Python dependency | Port to TypeScript for serverless compat |

---

## 13. PRIORITY ROADMAP

### Phase 1 — Template MVP (ship this)
1. Build setup wizard (`/admin/setup`) with key validation
2. Move passwords to bcrypt-hashed DB storage
3. Move API keys to `settings` table with env fallback
4. Refactor CSS to use dynamic color generation from config
5. Remove dead `GOOGLE_SHEET_ID` references
6. Add Drive folder pagination
7. Add rate limiting to auth + expensive endpoints
8. Sign the auth cookie
9. Write one-click deploy instructions

### Phase 2 — Polish
10. Port Python pipeline to TypeScript (kill Python dependency)
11. Break `page.tsx` into composable components
12. Extract all hardcoded strings to config
13. Add 2-3 theme presets (or own the terminal aesthetic)
14. Auto-run Supabase migrations from setup wizard
15. Add "Deploy to Vercel" button with env var prompts

### Phase 3 — Scale
16. Bundle face-api as ONNX in Node (eliminate separate service)
17. Docker Compose for self-hosted option
18. Add Stripe for license key validation
19. Usage analytics / telemetry (opt-in)
20. Template marketplace listing

---

## Summary

The app itself is well-built — the AI pipeline, search quality, and admin controls are strong. The gap is entirely in the **onboarding and configuration experience.** A buyer should be able to: deploy to Vercel, visit their URL, create an admin password, paste in 4-5 API keys, pick colors, set an audience password, and click "Sync" — all from the browser. Everything else is implementation detail that should be invisible to them. The setup wizard is the single highest-leverage thing to build next.
