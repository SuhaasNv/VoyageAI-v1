# VoyageAI — Final Pre-Commit Production Hardening Audit

**Date:** 2026-02-25  
**Scope:** Stability, security, performance, edge cases. No feature suggestions. No UI redesign.

---

## 1️⃣ Authentication & Session

| Finding | Severity | Details |
|---------|----------|---------|
| JWT issuance/validation | 🟢 Safe | `signAccessToken`/`signRefreshToken` in `lib/auth/tokens.ts`; `verifyAccessToken` used in layouts and API routes. |
| Duplicate user creation | 🟢 Safe | Register: `findUnique` before create + P2002 catch. Google: `upsert` by email. Single path. |
| Logout blocking | 🟢 Safe | `DashboardSidebarFooter` calls `logout()` then `window.location.href = "/login"`. Logout API returns immediately; token revoke is fire-and-forget. |
| Auth-dependent blocking SSR | 🟡 Should fix | Dashboard layout awaits `prisma.user.findUnique` + `prisma.trip.findMany` before rendering. Slow DB blocks entire layout. |

---

## 2️⃣ Database Integrity

| Finding | Severity | Details |
|---------|----------|---------|
| Trip.userId consistency | 🟢 Safe | All trip mutations use `auth.user.sub`; ownership checked on read/update/delete. |
| Orphan rows | 🟢 Safe | `Itinerary` and `ChatMessage` have `onDelete: Cascade` on `trip` relation. |
| Itinerary persistence transaction | 🟢 Safe | `prisma.$transaction([deleteMany, create, trip.update])` in itinerary route. |
| Race conditions in trip creation | 🟢 Safe | Single `prisma.trip.create` per request; no concurrent create for same user/destination. |

---

## 3️⃣ AI System Hardening

| Finding | Severity | Details |
|---------|----------|---------|
| LLM timeout | 🟢 Safe | All services pass `timeoutMs` (10–15s); Groq/Gemini use `AbortController`. |
| Rate limiting bypass | 🟢 Fixed | `POST /api/ai/create-trip` now calls `checkRateLimit(\`ai:${auth.user.sub}:create-trip\`)` before LLM execution. |
| JSON schema enforcement | 🟢 Safe | `parseJSONResponse` + Zod schemas (`ReoptimizeResponseSchema`, etc.) on outputs. |
| Reoptimize structural validation | 🟢 Safe | `validateItineraryStructure(final.reoptimizedItinerary)` runs on output. |
| Console logs in production | 🟡 Should fix | `usageLogger.ts:72` — `console.log` on DB fallback. `llm.ts:929`, `context.ts:257` — `console.warn` in retry/truncate. `reoptimize.service.ts:89`, `itinerary.service.ts:91`, `packing.service.ts:59`, `simulation.service.ts:58`, `chat.service.ts:79` — `console.error` instead of `logError`. |

---

## 4️⃣ Mapbox

| Finding | Severity | Details |
|---------|----------|---------|
| CSP | 🟢 Safe | `connect-src` includes `api.mapbox.com`, `*.tiles.mapbox.com`, `events.mapbox.com`. `worker-src blob:` present. |
| Double-remove map | 🟢 Safe | Cleanup calls `mapRef.current?.remove()` once. Error handler uses `currentMap?.remove()`; no overlap. |
| Geocode fallback | 🟢 Safe | No geocoding; coords come from AI. "No map coordinates" overlay when AI returns no lat/lng. |
| Map blocking dashboard | 🟢 Safe | TripMap is on trip page only. MapSimulationPanel is static SVG, no Mapbox. |

---

## 5️⃣ Image System (Pexels)

| Finding | Severity | Details |
|---------|----------|---------|
| Deterministic query | 🟢 Safe | `normalizeDestination` for cache key; `sanitized + " skyline city"` for Pexels query. |
| Fallback image | 🟢 Safe | Returns `null` on error/429/timeout; UI uses `TripCardImageFallback` gradient. |
| API key exposure | 🟢 Safe | Server-only; `NEXT_PUBLIC_PEXELS_API_KEY` throws in `env.ts`. |
| Rate-limit handling | 🟢 Safe | 429 caches null, returns null. |
| Broken image UI | 🟢 Safe | `onError` sets `imageError`; fallback gradient shown. |

---

## 6️⃣ Dashboard Performance

| Finding | Severity | Details |
|---------|----------|---------|
| Blocking server fetch | 🟡 Should fix | Layout awaits `prisma.user.findUnique` + `prisma.trip.findMany`. No streaming/suspense. |
| Loading states | 🟢 Safe | `UpcomingTripsGrid` receives `isLoading`; shows "Loading trips…" when true. `DashboardTripsProvider` always `isLoading: false` when using initial data. |
| Layout collapse | 🟢 Safe | `min-h-[320px]` on grid; skeleton/empty states render. |
| Hydration mismatch | 🟢 Safe | No obvious server/client HTML divergence. `useTrips` uses `ctx` when available. |

---

## 7️⃣ Security

| Finding | Severity | Details |
|---------|----------|---------|
| CSP | 🟢 Safe | `default-src 'self'`; script/style restricted; `frame-ancestors 'none'`; HSTS, X-Frame-Options, etc. |
| CSRF on mutating routes | 🟢 Safe | Middleware enforces CSRF on POST/PUT/PATCH/DELETE `/api/*`; exempt: login, register, refresh. |
| Sensitive env to client | 🟢 Safe | No `NEXT_PUBLIC_` for secrets. `env.ts` rejects `NEXT_PUBLIC_PEXELS_API_KEY`. |
| Error stack traces | 🟢 Safe | `formatErrorResponse` uses `isProd ? undefined : stack` for details. |

---

## 8️⃣ Logging

| Finding | Severity | Details |
|---------|----------|---------|
| console.log/error/warn | 🟡 Should fix | 15+ files use raw `console.*`. `logger.ts` uses console in prod (timestamped). Services should use `logError`/`logInfo` instead of `console.error`. |
| Structured logger | 🟢 Safe | `logError`, `logInfo` in `lib/logger.ts`; used in API routes and some services. |

---

## 9️⃣ Production Safety

| Scenario | Risk | Notes |
|----------|------|-------|
| High traffic | 🟡 | Layout blocks on DB; no connection pooling visibility. Rate limit on create-trip bypassed. |
| Slow DB | 🟡 | Layout + trip page block until Prisma returns. No timeout on layout fetch. |
| LLM timeout | 🟢 | All calls have `timeoutMs`; AbortController aborts. |
| Redis outage | 🟡 | Production rate limiter throws if Redis unavailable (no fallback). Auth rate limit uses Upstash; fallback to memory/DB. AI rate limiter: production requires Redis. |
| Mapbox outage | 🟢 | TripMap shows error overlay + retry; dashboard MapSimulationPanel is static. |

---

## Summary of Required Fixes

### 🔴 Critical — FIXED

1. ~~Add rate limiting to `POST /api/ai/create-trip`~~  
   - Applied: `checkRateLimit(\`ai:${auth.user.sub}:create-trip\`)` added in `src/app/api/ai/create-trip/route.ts`.

### 🟡 Should fix soon

1. **Replace `console.*` with structured logger** in:  
   - `usageLogger.ts`, `llm.ts`, `context.ts`  
   - `itinerary.service.ts`, `packing.service.ts`, `simulation.service.ts`, `reoptimize.service.ts`, `chat.service.ts`  
   - `useTrips.ts`, `profile/route.ts`, `auth/audit.ts`, `auth/rateLimit.ts`, `rateLimiter.ts`, `DashboardAIAssistant.tsx`, `error.tsx`

2. **Reduce layout blocking**  
   - Consider streaming/suspense for trips, or move trip fetch to page-level with loading boundary.

3. **Redis outage handling**  
   - Document that Redis is required in production for AI rate limiting.  
   - Optionally add circuit breaker or degraded mode.

---

## Production Readiness Score: **8/10**

- ~~**-1** for rate limit bypass on create-trip~~ — Fixed.
- **-1** for console logging in production code paths.
- **-1** for blocking layout and Redis dependency without documented fallback.
