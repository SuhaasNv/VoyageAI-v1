# VoyageAI Production Readiness Audit

**Date:** 2025-02-26  
**Scope:** Deep architectural and production-readiness audit. Analysis only; no code changes.

---

## 🔴 Critical Issues

| # | Finding | Location |
|---|---------|----------|
| 1 | **Reoptimize receives wrong itinerary format** — `AIChatDrawer` passes `tripJson.data.itinerary` (adapted `ItineraryDay[]` with `events`) to `/api/ai/reoptimize`. The API expects `ItinerarySchema` (raw AI format with `days[].activities`, `location.lat/lng`, etc.). Validation will fail; reoptimize from chat is broken. | `src/components/trip/AIChatDrawer.tsx` (lines 118–119, 129); `src/lib/ai/schemas/index.ts` (ReoptimizeRequestSchema) |
| 2 | **404 on every itinerary refresh** — `TripViewClient.handleItineraryRefresh` fetches `/api/trips/${id}/itinerary`, which does not exist. Only `GET /api/trips/[id]` exists. Second fetch returns 404 on every refresh; raw itinerary for map never updates from this path. | `src/components/trip/TripViewClient.tsx` (lines 31–35) |
| 3 | **Auth rate limiter falls back to in-memory in production** — `lib/auth/rateLimit.ts` catches Redis/DB errors and falls back to `memoryRateLimit`. In multi-instance production, each process has its own limit; an attacker can bypass by hitting different instances. | `src/lib/auth/rateLimit.ts` (lines 164–178) |
| 4 | **Env schema omits production-critical vars** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LLM_PROVIDER`, `GROQ_API_KEY`/`GEMINI_API_KEY`, `UPSTASH_REDIS_*` not in `lib/env.ts`. App can start with missing OAuth or LLM config; failures occur at runtime. | `src/lib/env.ts` |
| 5 | **`formatErrorResponse` does not handle `AIServiceError`** — AI routes catch `AIServiceError` (e.g. `RATE_LIMIT_EXCEEDED`, `LLM_ERROR`) but `formatErrorResponse` treats it as generic `Error` → 500. Rate limit and LLM errors lose correct status codes (429, 503). | `src/lib/errors.ts`; AI route catch blocks |

---

## 🟡 High-Risk Weaknesses

| # | Finding | Location |
|---|---------|----------|
| 1 | **AI rate limiter Redis fallback in dev only** — `checkRateLimit` falls back to in-memory when Redis errors in dev; in production it throws. But auth rate limiter always falls back. Inconsistent behavior; production AI routes fail hard on Redis outage while auth keeps working with weakened limits. | `src/lib/rateLimiter.ts` (line 127); `src/lib/auth/rateLimit.ts` |
| 2 | **Chat: orphaned user message on AI failure** — User message is persisted before AI call. If AI fails, user message remains in DB with no assistant response. User sees their message in history but no reply; retry sends duplicate. | `src/app/api/ai/chat/route.ts` (lines 53–61, 76) |
| 3 | **Budget `spent` always 0** — `serializeTrip` hardcodes `spent: 0`. No derivation from itinerary events. BudgetOverviewCard and TripTopBar show misleading spent/total. | `src/lib/services/trips.ts` (line 90); `BudgetOverviewCard`, `TripTopBar` |
| 4 | **Simulation and packing routes accept optional `tripId` without ownership check** — If `tripId` is passed, no validation that trip belongs to user. Low risk (itinerary/packing data is user-provided in body) but inconsistent with other AI routes. | `src/app/api/ai/simulation/route.ts`; `src/app/api/ai/packing/route.ts` |
| 5 | **Dashboard trips fetch: no loading/error UI** — `getUpcomingTrips()` failure only logs to console. User sees empty grid with no feedback. | `src/app/dashboard/page.tsx` (lines 32–38) |
| 6 | **CSP `connect-src 'self'`** — Blocks external API calls from client. Fine for same-origin API; verify no client-side calls to third-party APIs (e.g. Mapbox, external LLM) that would be blocked. | `src/middleware.ts` (line 66) |
| 7 | **`parseStoredItinerary` swallows parse errors** — Returns `[]` on any error. Malformed `rawJson` in DB yields empty itinerary with no logging or alert. | `src/lib/services/trips.ts` (lines 134–141) |

---

## 🟢 Minor Improvements

| # | Finding | Location |
|---|---------|----------|
| 1 | **Console.error in critical paths** — 20+ occurrences in API routes, services, auth. Acceptable for debugging; consider structured logger for production. | Various `src/` |
| 2 | **Two rate limiters** — Auth uses `lib/auth/rateLimit.ts` (Redis → DB → memory); AI uses `lib/rateLimiter.ts` (Redis → memory). Different backends and fallback chains. | `src/lib/auth/rateLimit.ts`; `src/lib/rateLimiter.ts` |
| 3 | **`reoptimizeTrip` in lib/api.ts does not use `unwrap`** — Duplicates error handling; inconsistent with other API helpers. | `src/lib/api.ts` (lines 111–128) |
| 4 | **UpcomingTripsGrid `IMAGES` array** — Static array for trip card images; not mock data but could be derived or configurable. | `src/components/dashboard/UpcomingTripsGrid.tsx` (lines 16–20) |
| 5 | **AISuggestionsCard static content** — Hardcoded suggestions; "View all" and clicks have no handlers. | `src/components/dashboard/AISuggestionsCard.tsx` |
| 6 | **`getClientIp` dev fallback** — Returns `127.0.0.1` when proxy headers absent. Document that production must set `X-Forwarded-For` or `X-Real-IP`. | `src/lib/api/request.ts` (line 28) |

---

## ⚙ Architectural Observations

### Core Product Loop Integrity

| Step | Status | Notes |
|------|--------|-------|
| Auth | ✅ | JWT + refresh; Google OAuth; CSRF on mutating routes |
| Create Trip | ✅ | POST /api/trips; ownership enforced |
| Generate Itinerary | ✅ | TimelineItinerary "Generate itinerary" → POST /api/ai/itinerary; persists + updates budget |
| Persist | ✅ | Itinerary and reoptimize both persist in transaction |
| Reload | ⚠️ | TripViewClient fetches non-existent `/itinerary` route → 404; GET /api/trips/[id] returns full trip |
| Chat Modify | ✅ | Chat persists; suggested actions wired |
| Reoptimize | ❌ | Chat passes wrong format; validation fails |
| Budget Update | ✅ | Itinerary + reoptimize update `budgetTotal` atomically |
| Data loss on reload | ⚠️ | Raw itinerary for map comes from server-rendered page; refresh uses broken `/itinerary` fetch |

**Dead-end states:** Reoptimize from chat fails validation. Map raw itinerary does not refresh correctly.

### AI System Integrity

| Area | Status |
|------|--------|
| LLM provider | ✅ `LLM_PROVIDER` enforced; mock blocked in production |
| Failure handling | ✅ Services throw; no silent fallback to mock data |
| Retry logic | ✅ `executeWithRetry` with configurable retries |
| JSON enforcement | ✅ `parseJSONResponse` strips markdown; throws on parse failure |
| Schema validation | ✅ Zod parse after `parseJSONResponse`; `validateItineraryStructure` post-parse |
| Malformed LLM output | ✅ Throws; no persistence of invalid data |
| Reoptimize vs itinerary | ✅ Same ItinerarySchema; reoptimize service returns consistent structure |

### Data Integrity & Ownership

| Query | Scoped By |
|-------|-----------|
| Trips | `userId` (auth.user.sub) |
| Itinerary | `tripId` (trip ownership verified first) |
| Chat messages | `tripId` (trip ownership verified first) |
| Reoptimize | Trip ownership verified before processing |
| Cross-user leakage | None; all trip/itinerary/chat scoped |
| Orphaned records | Chat can leave orphaned user message on AI failure |
| Reoptimize atomicity | ✅ Single transaction: deleteMany, create, trip update |
| Budget derivation | From itinerary `totalEstimatedCost`; no drift |

### Security & Abuse Surface

| Check | Status |
|-------|--------|
| AI routes authenticated | ✅ All use `getAuthContext`; 401 if absent |
| Rate limiting | ✅ AI: per-user; Auth: per-IP; Refresh: per-IP |
| Redis fallback | ⚠️ Auth falls back to memory in prod; AI throws in prod |
| CSRF | ✅ Mutating /api/* except login, register, refresh |
| Token leakage | ✅ Access token HttpOnly cookie; Bearer supported |
| Horizontal escalation | ✅ Trip ownership enforced; no IDOR |
| Google OAuth | GET only; no CSRF needed for redirect flow |

### Frontend–Backend Alignment

| Check | Status |
|-------|--------|
| Mock data imports | ✅ None; mock-trip removed |
| Static arrays for core features | ⚠️ AISuggestionsCard; UpcomingTripsGrid IMAGES |
| Dashboard data from APIs | ✅ getUpcomingTrips, getTripById |
| Loading states | ⚠️ Dashboard trips: none; TimelineItinerary: yes |
| Error states | ⚠️ Dashboard: silent; TimelineItinerary: retry UI |
| 404 routes | ❌ `/api/trips/[id]/itinerary` called but does not exist |
| Sidebar links | ✅ Dashboard, Settings; no broken links |
| Placeholder components | ⚠️ InteractiveMap (visual mock); AISuggestionsCard static |

### Performance & Stability

| Check | Status |
|-------|--------|
| Animation loops | ✅ DashboardBackground setInterval cleaned up on unmount |
| Mapbox | ✅ Single instance; cleanup in useEffect return |
| Duplicate maps | ✅ mountedRef guards |
| Unnecessary "use client" | ✅ Used where needed (forms, hooks, interactivity) |
| API overfetching | ⚠️ handleItineraryRefresh fetches same trip twice (one 404) |

### Production Hardening

| Check | Status |
|-------|--------|
| Env validation | ⚠️ Core only; OAuth, LLM, Redis not validated |
| LLM_PROVIDER enforcement | ✅ Mock blocked in production |
| Mock provider in prod | ✅ Throws on create |
| console.log in critical paths | ⚠️ console.error used; no structured logging |
| Error boundary | ✅ Root error.tsx; Try Again; dev details |
| Logging layer | ❌ No structured logger; console only |
| Scalability | ⚠️ Auth rate limit memory fallback; multi-instance weak |

---

## 📊 Final Deploy Readiness Score: **6/10**

**Blockers:** Reoptimize from chat broken (wrong format); 404 on itinerary refresh; auth rate limit memory fallback in production; env schema gaps; AIServiceError not handled in formatErrorResponse.

**After fixes:** Core loop (Create → Generate → Persist → Reload) works. Reoptimize from TimelineItinerary "Regenerate" works (uses same itinerary API). Chat reoptimize and map refresh need fixes. Security and rate limiting need production hardening.
