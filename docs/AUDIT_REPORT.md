# VoyageAI — Architectural & Production-Readiness Audit

**Date:** 2026-02-25  
**Scope:** Full codebase analysis across architecture, security, AI, data, frontend, performance, production readiness.

---

## 🔴 Critical Issues (Must Fix Before Deploy)

| # | Issue | Location |
|---|-------|----------|
| 1 | **AI routes unauthenticated** — `/api/ai/chat`, `/api/ai/itinerary`, `/api/ai/packing`, `/api/ai/reoptimize`, `/api/ai/simulation` do not call `getAuthContext()`. Any unauthenticated client can consume AI quota. | `app/api/ai/*/route.ts` |
| 2 | **`lib/api.reoptimizeTrip` omits CSRF token** — POST to `/api/ai/reoptimize` fails CSRF middleware (no `X-CSRF-Token` header). Call would return 403. | `lib/api.ts:49-56` |
| 3 | **Secrets in `.env`** — DB credentials, JWT secrets, CSRF secret, Google OAuth client ID/secret present. Ensure `.env` is never committed; `.gitignore` has `.env*` but verify no accidental commit. | `.env` |
| 4 | **Access token cookie non-HttpOnly** — `voyageai_at` is `httpOnly: false` for middleware read. Exposes token to XSS; stolen token = full session. | `lib/auth/cookies.ts:71-76` |
| 5 | **No error boundaries** — No `error.tsx` in app tree. Uncaught React errors crash full page with no recovery. | `app/` |
| 6 | **Prisma schema lacks Trip/Itinerary models** — Architecture doc specifies trips, itinerary, budget, chat. Schema has only User, RefreshToken, AuditLog, RateLimitEntry. All trip data is mock; no persistence. | `prisma/schema.prisma` |

---

## 🟡 High Priority Improvements

| # | Issue | Location |
|---|-------|----------|
| 1 | **Three rate limiters, inconsistent usage** — `lib/rateLimiter.ts` (Redis), `lib/auth/rateLimit.ts` (auth), `lib/ai/ratelimit.ts` (in-memory AI). Only itinerary service calls `enforceRateLimit`. Chat, packing, reoptimize, simulation have no rate limiting. | `services/ai/*.ts`, `lib/ai/ratelimit.ts`, `lib/rateLimiter.ts` |
| 2 | **`lib/rateLimiter.ts` unused** — Comment says "routes rely on service layer which calls checkRateLimit" but no service imports it. AI uses `lib/ai/ratelimit.ts` (in-memory only). | `lib/rateLimiter.ts` |
| 3 | **CSRF exempt paths incomplete** — `/api/auth/google` and `/api/auth/google/callback` are GET; no exemption needed. Logout requires CSRF; authStore sends it. Verify no other auth endpoints need exemption. | `middleware/csrf.ts:38-43` |
| 4 | **JWT middleware uses structural check only** — `looksLikeJwt()` does not verify signature. Forged token passes middleware; API handlers must verify. Handlers use `verifyAccessToken` — correct, but middleware could be stricter. | `middleware.ts:56-59` |
| 5 | **CSP allows `unsafe-inline` and `unsafe-eval`** — Comment notes Next.js/Framer Motion need it in dev. Production should tighten; `unsafe-eval` weakens XSS mitigation. | `middleware.ts:106-113` |
| 6 | **`lib/api.ts` conflates mock data and API client** — `getUpcomingTrips`, `getTripById`, `createTrip` return mock data; `reoptimizeTrip` calls API. No clear separation; `createTrip` never persists. | `lib/api.ts` |
| 7 | **CreateTripModal has no submit logic** — "Generate Itinerary" button has no `onClick` handler; form fields (dates, vibe) are uncontrolled. Modal is non-functional. | `CreateTripModal.tsx` |
| 8 | **AIChatDrawer uses mock responses** — `setTimeout` simulates AI reply; does not call `/api/ai/chat`. | `AIChatDrawer.tsx:19-24` |
| 9 | **Dashboard fetches mock trips on mount** — `getUpcomingTrips()` returns static mock; no loading/error UI beyond `console.error`. | `dashboard/page.tsx` |
| 10 | **Refresh token family rotation on every refresh** — `newTokenFamily()` on each refresh. Architecture doc suggests single-use rotation; family change on every refresh may complicate reuse detection semantics. | `api/auth/refresh/route.ts:154` |

---

## 🟢 Optional Enhancements

| # | Issue | Location |
|---|-------|----------|
| 1 | **No Sentry or error monitoring** — Architecture doc lists Sentry; not integrated. | — |
| 2 | **No structured request logging** — `console.error` only; no request ID, no log levels, no aggregation. | API routes |
| 3 | **Mock LLM has 5% failure rate** — `Math.random() < 0.05` throws for testing; remove or gate behind env in production. | `lib/ai/llm.ts:102-108` |
| 4 | **Auth hydrator runs on every dashboard mount** — `refreshAccessToken()` when `!user`; no debounce. Could cause redundant refresh calls. | `AuthHydrator.tsx` |
| 5 | **Navbar always shows Login/Sign Up** — No conditional render for authenticated users (e.g. Dashboard link). | `Navbar.tsx` |
| 6 | **`connect-src 'self'`** — CSP may block external API calls if backend is different origin. Verify `NEXT_PUBLIC_APP_URL` and CORS. | `middleware.ts:110` |
| 7 | **Prisma `ssl: { rejectUnauthorized: false }`** — Accepts any cert. Acceptable for Supabase; document and consider stricter in high-security envs. | `lib/prisma.ts:27` |

---

## ⚙ Structural Observations

### Architecture & Layering

- **UI → API → Services → DB**: Auth flow is clean (route → tokens/cookies → prisma). AI flow: route → validateBody → service → llm. No business logic in React components for auth.
- **Violations**: `lib/api.ts` mixes mock data layer with API client. `CreateTripModal` and `AIChatDrawer` contain mock logic instead of calling APIs.
- **Duplication**: `displayName()` duplicated in `DashboardSidebarFooter` and `dashboard/page.tsx`. Rate limit logic spread across 3 modules.
- **Circular deps**: None detected.
- **Business logic in components**: `AIChatDrawer` has mock AI logic; `CreateTripModal` has no real submit. Dashboard page calls `getUpcomingTrips` (mock) in useEffect.

### Security

- **CSRF**: Double-submit cookie + HMAC; exempt paths correct for login/register/refresh. `lib/api.reoptimizeTrip` does not send token.
- **JWT**: Access 15min, refresh 7d; rotation with family; reuse detection revokes family. Middleware only checks structure.
- **Cookies**: Refresh httpOnly, path `/api/auth`. Access token readable by JS (for middleware). SameSite strict/lax as needed.
- **Rate limiting**: Auth routes (login, register, refresh) use `lib/auth/rateLimit`. AI routes: only itinerary has `enforceRateLimit`; others unprotected.

### AI Orchestration

- **Prompts**: Layered (system, context, schema, task). Centralized in `lib/ai/prompts`.
- **Schemas**: Zod validation on input and output. `parseJSONResponse` + schema parse in services.
- **Error handling**: Services have try/catch with fallback responses (chat, itinerary). Consistent pattern.
- **Retry**: `executeWithRetry` in llm.ts with configurable retries.
- **Rate limiting**: Only itinerary; chat, packing, reoptimize, simulation unprotected. `lib/rateLimiter.ts` (Redis) unused.

### Data Layer

- **Prisma**: Singleton via `globalForPrisma`; single Pool. Correct pattern.
- **N+1**: No complex joins in current queries. Trip/itinerary not in DB.
- **Env**: Uses `process.env`; no hardcoded secrets in code. `.env` must stay out of repo.
- **Secrets**: Present in `.env`; ensure not committed.

### Frontend

- **Server vs Client**: Marketing pages, layout, most pages are Server Components. Dashboard, auth, modals, Hero, etc. are Client (`"use client"`). Appropriate split.
- **Bundle**: Framer Motion dynamic-imported for `motion.nav`; no obvious bloat. No code-splitting for heavy AI components.
- **Coupling**: `lib/api` used by dashboard, trip page, UpcomingTripsGrid, TimelineItinerary. Trip type from mock data.
- **Design system**: `glass-card`, `glass-dashboard`, `bg-[#0A0D12]`, `#10141a` consistent. Marketing pages use `PageHero`, `PageContent`.

### Performance

- **Client rendering**: Dashboard, trip page fully client. Could preload trips server-side when Trip model exists.
- **Caching**: No `unstable_cache` or React cache. Mock data is synchronous.
- **Re-renders**: Zustand persist; no obvious excessive re-renders.
- **API throttling**: No client-side debounce on chat input; no request coalescing.

### Production Readiness

- **Logging**: `console.error` only. No structured logs, no request IDs.
- **Error boundaries**: None.
- **Monitoring**: Sentry mentioned in docs; not integrated.
- **Deployment**: Next.js 16; no `output: 'standalone'` in config (architecture doc suggests it for Docker).
- **Env**: `NEXT_PUBLIC_APP_URL`, `NODE_ENV` used. No validation schema (e.g. Zod) for required env at startup.

---

## 📈 Overall Maturity Score: **5/10**

**Breakdown:**
- Architecture: 6/10 — Clean auth; AI and trip layers incomplete; mock data throughout.
- Security: 5/10 — Strong auth/CSRF base; AI routes unauthenticated; access token in JS.
- AI: 6/10 — Good prompt/schema structure; mock LLM; inconsistent rate limiting.
- Data: 4/10 — Prisma correct; no Trip persistence; mock-only.
- Frontend: 6/10 — Reasonable component split; some non-functional UI.
- Performance: 5/10 — No major issues; no optimization.
- Production: 4/10 — No error boundaries, monitoring, or structured logging.

**Verdict:** Not production-ready. Critical security and data gaps must be addressed before deploy.
