# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/binaryLady/eventlens/security/advisories/new) rather than opening a public issue.

## Architecture Security Model

EventLens processes event photos through external AI services and stores metadata in Supabase. The security model is designed around a single-event deployment where one organizer controls the pipeline and attendees consume the gallery.

### Authentication

- **Gallery access** — password-gated via `APP_PASSWORD`. Auth state is stored in an HTTP-only cookie set by `/api/auth/login`.
- **Admin endpoints** — protected by `Authorization: Bearer <ADMIN_API_SECRET>` header. Pipeline, moderation, and status routes all validate this token server-side.
- **Face-API service** — authenticated via `FACE_API_SECRET` bearer token between the Next.js backend and the InsightFace microservice.

### Data Handling

- **No selfie storage.** When an attendee uploads a selfie for face matching, it is embedded into a 512-dim vector in memory, compared against indexed face embeddings, and discarded. The image is never written to disk or database. Only the embedding vector is optionally stored in `match_sessions` for analytics.
- **No PII in the database.** The `match_sessions` table stores face embedding vectors (not images), match counts, and matched photo IDs. There are no names, emails, or user accounts.
- **Photos stay in Google Drive.** EventLens reads photo metadata and thumbnails via the Drive API. Original files are never copied to the application server or database.

### API Keys and Secrets

All secrets are loaded from environment variables at runtime. The `.env.example` file documents required variables without values. The `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local` files.

| Secret | Scope | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | Server-side only | Drive API read access |
| `GEMINI_API_KEY` | Server-side only | Vision analysis and text embeddings |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only | Database operations (bypasses RLS) |
| `ADMIN_API_SECRET` | Server-side only | Admin endpoint authentication |
| `APP_PASSWORD` | Server-side only | Gallery access gate |
| `FACE_API_SECRET` | Server-side only | InsightFace service authentication |

No secrets are exposed to the client. The only `NEXT_PUBLIC_` variables are the Supabase URL (public by design) and cosmetic branding values.

### Server-Side Protections

- **Admin routes** validate the bearer token before executing any pipeline or moderation action.
- **Auth middleware** (`src/middleware.ts`) intercepts requests to protected routes and redirects unauthenticated users.
- **Video proxy** (`/api/video`) streams Drive content through the server to avoid exposing the Google API key to the client.
- **ZIP downloads** are capped at 50 photos per request to prevent resource exhaustion.

### Known Limitations

- **No rate limiting on login.** The password gate does not throttle failed attempts. For private events with short-lived deployments, this is an acceptable tradeoff. For longer-lived or public-facing deployments, add rate limiting middleware.
- **Supabase service role key bypasses RLS.** All database access goes through server-side API routes using the service role key. Row-Level Security policies are not configured because there is no per-user identity model. If multi-tenancy is added, RLS should be enabled.
- **HTTP-only cookie, no CSRF token.** The auth cookie is HTTP-only and SameSite=Lax. State-changing operations use POST with JSON bodies, which provides baseline CSRF protection. A dedicated CSRF token would strengthen this.

## Dependencies

Security updates for dependencies are tracked via [Dependabot](https://github.com/binaryLady/eventlens/security/dependabot). Review and merge dependency PRs promptly.
