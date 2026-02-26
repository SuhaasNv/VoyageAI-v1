# VoyageAI Production Readiness Audit

**Date:** 2025-02-25  
**Scope:** Strict deploy-gate audit. Analysis only; no code changes.

---

## 🔴 Critical Issues (must fix before deploy)

| # | Finding | Location |
|---|---------|----------|
| 1 | **AI routes allow anonymous access** — `userId = getAuthContext(req)?.user.sub ?? "anon"` permits unauthenticated calls. Rate limit key `ai:anon:*` enables quota abuse; no auth enforcement. | `src/app/api/ai/*/route.ts` (all 5) |
| 2 | **All trip data is mock** — `getUpcomingTrips()`, `getTripById()`, `createTrip()` return hardcoded data from `@/data/mock-trip`. No backend persistence. Prisma has no Trip model. | `src/lib/api.ts`, `src/data/mock-trip.ts`, `prisma/schema.prisma` |
| 3 | **CreateTripModal does not submit** — "Generate Itinerary" button has no `onClick`; form fields (dates, vibe) are not wired. Trip creation flow is non-functional. | `src/components/dashboard/CreateTripModal.tsx` |
| 4 | **AIChatDrawer uses mock responses** — `handleSend` uses `setTimeout` with hardcoded reply. No call to `/api/ai/chat`. | `src/components/trip/AIChatDrawer.tsx` |
| 5 | **Access token cookie is not HttpOnly** — `httpOnly: false` for `voyageai_at` (required for Edge middleware to read it). XSS can steal access token. | `src/lib/auth/cookies.ts` |
| 6 | **JWT access and refresh can share one secret** — `env.ts` allows `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to fall back to `JWT_SECRET`. Single secret weakens token isolation. | `src/lib/env.ts` |
| 7 | **`reoptimizeTrip` client fetch omits CSRF** — `lib/api.ts` `reoptimizeTrip()` does not send `X-CSRF-Token` or `credentials: "include"`. POST would fail CSRF. | `src/lib/api.ts` |

---

## 🟡 High Risk / Architectural Gaps

| # | Finding | Location |
|---|---------|----------|
| 1 | **Two rate limiters, different backends** — Auth uses `lib/auth/rateLimit.ts` (Redis → DB → memory). AI uses `lib/rateLimiter.ts` (Redis → memory only). Inconsistent fallback chains. | `src/lib/auth/rateLimit.ts`, `src/lib/rateLimiter.ts` |
| 2 | **AI rate limiter in-memory fallback in production** — When Redis is absent or down, `checkRateLimit` uses process-local Map. Multi-instance deployment = per-process limits; quota bypass. | `src/lib/rateLimiter.ts` |
| 3 | **CSP allows `unsafe-inline` and `unsafe-eval`** — `script-src 'self' 'unsafe-inline' 'unsafe-eval'` weakens XSS mitigation. | `src/middleware.ts` |
| 4 | **CSRF rejection returns before request ID** — Middleware order: protected routes → CSRF → request ID. CSRF rejections (403) lack `X-Request-ID` header. | `src/middleware.ts` |
| 5 | **Refresh token family rotated on every refresh** — `newTokenFamily()` on each refresh. Non-standard; family typically fixed until reuse. Still detects same-token replay. | `src/app/api/auth/refresh/route.ts` |
| 6 | **Middleware JWT check is structural only** — `looksLikeJwt()` validates format, not signature. Forged tokens pass middleware; route handlers must verify. Route handlers do verify. | `src/middleware.ts` |
| 7 | **UPSTASH_REDIS_* not validated at startup** — Env schema does not require them. App starts without Redis; rate limiters silently fall back. | `src/lib/env.ts` |
| 8 | **Prisma singleton not cached in production** — `if (env.NODE_ENV !== "production") { globalForPrisma.prisma = prisma; }` — in production, `globalForPrisma` is never set. Module cache still yields one client per process; acceptable but unusual. | `src/lib/prisma.ts` |

---

## 🟢 Minor Improvements

| # | Finding | Location |
|---|---------|----------|
| 1 | **AISuggestionsCard is static** — Suggestions hardcoded; "Ask AI" / "Review Route" buttons have no handlers. | `src/components/dashboard/AISuggestionsCard.tsx` |
| 2 | **`/api/profile` only supports PATCH** — No GET for profile; client may need it. | `src/app/api/profile/route.ts` |
| 3 | **Error boundary does not surface request ID** — Dev-only details show `error.message` and `digest`; no `X-Request-ID` for correlation. | `src/app/error.tsx` |
| 4 | **`replacedBy` stores token hash, schema comment says cuid** — `RefreshToken.replacedBy` holds `newTokenHash`; comment suggests cuid. Cosmetic. | `prisma/schema.prisma`, `src/app/api/auth/refresh/route.ts` |
| 5 | **Dashboard sidebar links to non-existent routes** — `/dashboard/explore`, `/dashboard/trips`, `/dashboard/messages` may 404. | `src/app/dashboard/layout.tsx` |

---

## ⚙ Structural Notes

| Area | Status |
|------|--------|
| **Auth token lifecycle** | Access 15 min, refresh 7 days. Rotation on refresh; reuse detection. |
| **Cookie flags** | Refresh: HttpOnly, Secure (prod), SameSite strict, path `/api/auth`. Access: non-HttpOnly, Secure (prod), SameSite lax. CSRF: JS-readable, Secure, SameSite strict. |
| **CSRF coverage** | All POST/PUT/PATCH/DELETE on `/api/*` except login, register, refresh. Header vs cookie match + HMAC verify. |
| **Middleware order** | Protected pages → CSRF → request ID → security headers. |
| **API error format** | `{ success: false, error: { code, message, details?, requestId? } }`. Consistent. |
| **Global error boundary** | Exists; dev-only details; Try Again button. |
| **Env validation** | Zod at startup; DATABASE_URL, JWT_SECRET, CSRF_SECRET required. Throws on failure. |
| **Prisma usage** | Singleton via module cache. |
| **"use client"** | Used only in components that need interactivity; root layout is server. |

---

## 📊 Deploy Readiness Score: **3/10**

**Blockers:** Mock data in production paths; AI routes unauthenticated; trip creation and AI chat flows non-functional; access token XSS exposure; single JWT secret fallback.
