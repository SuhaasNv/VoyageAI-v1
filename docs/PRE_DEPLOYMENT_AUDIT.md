# VoyageAI Pre-Deployment Audit

**Date:** 2025-02-25  
**Scope:** Deploy-gate review before public beta launch  
**Methodology:** Static analysis only — no code modifications

---

## 🔴 Critical Issues (must fix before deploy)

| # | Location | Finding |
|---|----------|---------|
| 1 | `src/lib/ai/llm.ts` (GeminiLLMClient) | **No timeout/AbortController on fetch.** Gemini requests can hang indefinitely. Groq client uses `timeoutMs` + AbortController; Gemini has none. |
| 2 | `src/app/dashboard/trip/[id]/page.tsx:50` | **Unvalidated rawItinerary cast.** `rawItinerary = itineraryRow.rawJson as Itinerary` — no schema validation. Malformed DB data could cause frontend crash when passed to TripMap/AIChatDrawer. TripMap is defensive (`raw?.days`), but AIChatDrawer sends to reoptimize; API validates. Risk: edge cases where malformed shape causes runtime errors before validation. |
| 3 | `src/services/ai/reoptimize.service.ts` | **No `validateItineraryStructure` on reoptimized itinerary.** Itinerary service validates budget, empty days, coordinates before persistence. Reoptimize only runs `ReoptimizeResponseSchema.parse()` — no structural validation. LLM could return budget-exceeding or empty-day itinerary; it would be persisted. |

---

## 🟡 High-Risk Weaknesses (should fix before public beta)

| # | Location | Finding |
|---|----------|---------|
| 1 | `src/lib/env.ts` | **No `NEXT_PUBLIC_APP_URL` validation in production.** OAuth redirect URI uses it (`src/app/api/auth/google/route.ts:23`). Defaults to `localhost:3000` — production OAuth would fail or redirect incorrectly. |
| 2 | `src/lib/services/trips.ts:136-145` | **`parseStoredItinerary` returns `[]` on any parse failure.** Malformed `rawJson` yields empty itinerary; user sees "No itinerary yet" with no error. Silent data loss from user perspective. Consider surfacing parse failure. |
| 3 | `src/lib/errors.ts:77-85` | **AIServiceError `TIMEOUT` and `CONTEXT_TOO_LARGE` map to 500.** Industry practice: timeout → 503 (service unavailable). Minor but inconsistent. |
| 4 | `src/services/ai/*.ts`, `src/lib/auth/google.ts`, `src/lib/auth/rateLimit.ts`, `src/lib/auth/audit.ts`, `src/lib/ai/usageLogger.ts`, `src/lib/ai/context.ts`, `src/lib/ai/llm.ts` | **Direct `console.error`/`console.log`/`console.warn` in services and libs.** Logger abstraction exists but not applied to: itinerary.service, reoptimize.service, chat.service, packing.service, simulation.service, google.ts, rateLimit.ts, audit.ts, usageLogger.ts, context.ts, llm.ts. Production logs bypass structured format. |
| 5 | `src/app/error.tsx:14` | **Error boundary uses `console.error`** — should use `logError` for consistency. |
| 6 | `src/components/trip/TripMap.tsx:224` | **Cleanup: `mapRef.current?.remove()`** — Mapbox Map has `remove()`. But `currentMap?.remove()` in cleanup; `mapRef.current` may be stale. Double-remove on same ref is safe. Verify no leak if effect re-runs before cleanup. |
| 7 | `src/components/trip/TripMap.tsx:59-60` | **Event listeners on marker elements:** `mouseenter`/`mouseleave` added in `makeMarkerEl` but never removed. Markers are removed via `marker.remove()` which detaches DOM — listeners go with it. Acceptable. |

---

## 🟢 Minor Improvements (polish-level)

| # | Location | Finding |
|---|----------|---------|
| 1 | `src/components/trip/InteractiveMap.tsx` | **Dead code.** Not imported anywhere. TripViewClient uses TripMap. Remove or document as unused. |
| 2 | `src/components/trip/TripViewClient.tsx:31-33` | **handleItineraryRefresh:** `catch { /* silently ignore */ }` — no user feedback on fetch failure. |
| 3 | `src/components/dashboard/UpcomingTripsGrid.tsx:37` | **`confirm()` for delete** — native browser dialog. Consider custom modal for consistency. |
| 4 | `src/lib/ai/usageLogger.ts:72` | **Fallback to `console.log`** when DB write fails — should use `logInfo` for consistency. |
| 5 | `src/lib/env.ts` | **No `NEXT_PUBLIC_MAPBOX_TOKEN`** validation. TripMap shows message if missing. Optional for core flow. |
| 6 | `src/middleware.ts:66` | **CSP `connect-src 'self'`** — correct. No external API calls from client. |
| 7 | `src/components/trip/TimelineItinerary.tsx:86` | **Generic error message:** "AI is busy, try again" — could surface `json?.error?.message` when available. |

---

## ⚙ Architectural Observations

| Area | Observation |
|------|-------------|
| **Product loop** | Auth → Create Trip → Generate Itinerary → Persist → Reload → Chat → Reoptimize → Persist → Budget Update → Reload. Flow is coherent. Ownership checks before all mutations. |
| **Data ownership** | All trip queries scoped by `userId` or trip ownership. `GET /api/trips/[id]`, `PATCH`, `DELETE` verify `trip.userId === auth.user.sub`. Itinerary and chat queries use `tripId`; trip ownership verified first. No IDOR path found. |
| **Persistence** | Itinerary: `deleteMany` + `create` + `trip.update` in single transaction. Reoptimize: same. Chat: user + assistant messages in single transaction. Atomic. |
| **Budget derivation** | Always from `itinerary.totalEstimatedCost`. Trip `budgetTotal`/`budgetCurrency` updated in same transaction as itinerary persist. No drift. |
| **AI validation** | Itinerary: `parseJSONResponse` → `ItinerarySchema.parse` → `validateItineraryStructure`. Reoptimize: `parseJSONResponse` → `ReoptimizeResponseSchema.parse` only. Gap: no structural validation on reoptimized output. |
| **LLM provider** | `LLMClientFactory` throws in production if `mock` or invalid provider. `env.ts` superRefine enforces `LLM_PROVIDER` + API key in production. No mock fallback in prod. |
| **Rate limiting** | AI: `lib/rateLimiter.ts` — production throws on Redis unavailability. Auth: `lib/auth/rateLimit.ts` — Redis → DB → memory in dev; prod throws on Redis/DB failure. Consistent. |
| **CSRF** | Double-submit cookie + HMAC. Exempt: login, register, refresh. All mutating API routes require CSRF. |
| **Cookies** | Access token: HttpOnly, Secure (prod), SameSite=lax. Refresh: HttpOnly, path=/api/auth. CSRF: JS-readable (required for header). Correct. |
| **Multi-instance** | Rate limit uses Upstash Redis — shared across instances. Auth uses Redis/DB. Safe. |
| **Redis outage** | Production: both limiters throw. No silent fallback. Correct. |

---

## 📊 Final Deploy Readiness Score: **7/10**

**Breakdown:**
- Core loop integrity: ✅
- AI system: ⚠️ (Gemini timeout, reoptimize validation gap)
- Data integrity: ✅ (reoptimize structural validation gap)
- Security: ✅ (env validation gap for NEXT_PUBLIC_APP_URL)
- Frontend–backend: ✅ (minor error UX)
- Performance: ✅ (TripMap cleanup correct)
- Production hardening: ⚠️ (console in services, error boundary)

---

## 🚀 Launch Recommendation

**Ready for Closed Beta** — with the following conditions:

1. **Must fix before any deploy:** Gemini timeout, reoptimize structural validation.
2. **Should fix before public beta:** `NEXT_PUBLIC_APP_URL` env validation, logger in services, rawItinerary validation on trip page.
3. **Closed beta acceptable:** Remaining items (console usage, error UX) are polish.

**Not Ready for Public Beta** until Critical and High-Risk items are addressed.
