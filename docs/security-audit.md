# VoyageAI — Security & Production Readiness Audit

**Document type:** Living audit (update when architecture or threats change)  
**Scope:** Full-stack Next.js app, API routes, Prisma, multi-agent pipeline, CI/CD

---

## 1. Executive summary

| Area | Status |
|------|--------|
| **Overall** | **Needs ongoing hardening** — solid baseline; not “done” for high-assurance production without addressing items below |
| **Auth & CSRF** | Strong patterns (JWT, refresh, CSRF on mutating `/api/*`, rate limits on auth) |
| **Authorization** | Improved: admin-only cache clear; admin emails configurable via env |
| **Secrets** | Rely on `.env*` gitignore + CI Gitleaks; rotate if ever leaked |
| **Dependencies** | Run `npm audit` regularly; transitive issues via Prisma toolchain |
| **Tests** | Vitest for orchestrator; **CI runs `npm test`** (see checklist) |

---

## 2. Architecture (code understanding)

### Stack

- **Frontend:** Next.js 16 App Router (`src/app/`), React 19, Tailwind, Mapbox, Zustand
- **Backend:** Route handlers `src/app/api/**/route.ts` (~37 API surfaces)
- **Database:** PostgreSQL via Prisma (`prisma/schema.prisma`, `src/lib/prisma.ts`)
- **Auth:** JWT access + httpOnly refresh, Google OAuth, CSRF (double-submit + HMAC) on state-changing API calls
- **AI:** `src/lib/ai/` — OpenAI-primary, Gemini fallback (per current `develop`); agents: planner, research, logistics, budget, safety; `AgentOrchestrator` in `src/orchestrator/`
- **External:** Mapbox, Pexels, OpenAI, Gemini, optional Upstash Redis, optional Bright Data SERP (`src/tools/brightDataTool.ts`)

### Request lifecycle

1. **Edge middleware** (`src/middleware.ts`): CSRF for POST/PUT/PATCH/DELETE on `/api/*` (with exemptions), security headers, CSP, request ID
2. **Route handler:** `runWithRequestContext`, `getAuthContext` where needed, Zod validation, Prisma / LLM
3. **Response:** `src/lib/api/response.ts` envelope

### Key modules

| Module | Responsibility |
|--------|----------------|
| `src/app/api/*` | HTTP API |
| `src/services/auth/*` | Tokens, cookies, CSRF, rate limit, audit |
| `src/lib/prisma.ts` | DB client |
| `src/lib/ai/*` | LLM routing, prompts, schemas |
| `src/agents/*` | Agent steps in trip pipeline |
| `src/orchestrator/*` | End-to-end run + hybrid decision loop |
| `src/infrastructure/*` | Env validation (`env.ts`), logging, OpenAI client |
| `src/lib/admin.ts` | Admin allowlist + `isAdminPayload` |

---

## 3. Functional validation notes

- **Duplicate domain types:** `TripContext` / enriched / optimized shapes are re-declared across agents — **drift risk**; consider `src/agents/types/` or shared package
- **Bright Data:** Contract (`brightDataTool.ts` URL + body) must stay aligned with vendor API; failure → empty grounding + LLM-only path
- **API surface:** Large; spot-check new routes for auth + CSRF + Zod

---

## 4. Integration

- **Frontend ↔ API:** Ensure mutating calls send `X-CSRF-Token` matching cookie
- **Redis optional:** Rate limit / cache degrade when unset; **production** should define behavior when Redis + DB rate limit both fail (see High issues)
- **Orchestrator:** Assumes compatible shapes between planner → research → logistics → budget → safety

---

## 5. Testing & reliability

- **Vitest:** `src/orchestrator/__tests__/agentOrchestrator.test.ts`, `vitest.config.ts`
- **CI** (`.github/workflows/ci.yml`): Gitleaks, `npm ci`, Prisma, `tsc`, ESLint, madge, **`npm test`**, `npm run build`
- **Gaps:** Most API routes and agents lack dedicated tests; consider auth/CSRF/admin integration tests

---

## 6. Security findings (prioritized)

### Critical (address before high-assurance prod)

| ID | Issue | Mitigation |
|----|--------|------------|
| C1 | Leaked credentials in git history, logs, or chat | Rotate **all** secrets; use Gitleaks in CI (already enabled) |
| C2 | ~~`POST /api/admin/clear-image-cache` allowed any authenticated user~~ | **Fixed:** `isAdminPayload(auth.user)` + `forbiddenResponse()` — see `src/app/api/admin/clear-image-cache/route.ts` |

### High

| ID | Issue | Mitigation |
|----|--------|------------|
| H1 | ~~Hardcoded admin emails only~~ | **Improved:** `ADMIN_EMAILS` env (comma-separated) merged with defaults in `src/lib/admin.ts`; optional field in `src/infrastructure/env.ts` |
| H2 | `/api/ai/landing` CSRF-exempt (`src/middleware/csrf.ts`) | Strict rate limits (present); monitor abuse; consider CAPTCHA or signed quotas |
| H3 | `npm audit` — e.g. transitive **@hono/node-server** (high) via Prisma tooling | Track upgrades; confirm dev-only; run `npm audit` / Dependabot |
| H4 | Rate limit: production may **throw** if Redis + DB fail | Define policy: fail-closed vs in-memory fallback + alerts (`src/services/auth/rateLimit.ts`) |

### Medium

| ID | Issue | Mitigation |
|----|--------|------------|
| M1 | Duplicate agent types | Shared types module |
| M2 | Bright Data API drift | Vendor doc check + mocked integration test |
| M3 | CSP dev uses `unsafe-inline` / `unsafe-eval` | Acceptable for DX; **production** branch must stay strict (`src/middleware.ts`) |

### Low

| ID | Issue | Mitigation |
|----|--------|------------|
| L1 | `dangerouslySetInnerHTML` in map/timeline CSS | Keep static only; never user HTML |
| L2 | Research agent throws if hotels cannot be filled | Orchestrator surfaces error; optional soft fallback for UX |
| L3 | Orchestrator `reoptimize_budget` path may double-call budget | Harmless redundancy; simplify later |

---

## 7. Performance & scalability

- Dominant cost/latency: **LLM** calls (itinerary, landing, agents, orchestrator decision loop)
- Mitigations: caching where implemented, rate limits, timeouts on OpenAI client
- Orchestrator: up to **3** decision rounds — monitor token spend and p99 latency

---

## 8. CI/CD & DevOps

- **GitHub Actions:** CI, CodeQL, release workflow, Dependabot
- **No Dockerfile** in repo — document host (e.g. Vercel) env separation: dev / staging / prod
- **`SKIP_ENV_VALIDATION=1`** in CI only — **never** in real production deploys
- **`ADMIN_EMAILS`** — set in production for extra admins without code deploy

---

## 9. Error handling & logging

- `logError` / `logInfo` used on critical paths; avoid logging bodies containing passwords or tokens
- CSRF rejection uses `console.error` with reason string — acceptable; avoid dumping full request

---

## 10. Implemented remediations (this repo)

The following were applied to align with this audit:

1. **`src/app/api/admin/clear-image-cache/route.ts`** — Requires `isAdminPayload(auth.user)` after authentication.
2. **`src/lib/admin.ts`** — Default allowlist + `process.env.ADMIN_EMAILS` (comma-separated); email match is **case-insensitive**.
3. **`src/infrastructure/env.ts`** — Optional `ADMIN_EMAILS` in schema / raw input for documentation and consistency.
4. **`.github/workflows/ci.yml`** — Step **10. Unit tests (Vitest)** runs `npm test` before production build.

---

## 11. Pre-production checklist

- [ ] No secrets in git history (or rotated after any incident)
- [ ] Production: `LLM_PROVIDER`, API keys, DB, Redis (if used for rate limit), `ADMIN_EMAILS` if needed
- [ ] **Never** set `SKIP_ENV_VALIDATION` in production
- [ ] `npm audit` reviewed; Dependabot PRs triaged
- [ ] Smoke test admin routes as non-admin → **403**
- [ ] Load / chaos test orchestrator (LLM timeout, DB down)
- [ ] Verify Bright Data API against current vendor documentation

---

## 12. References (in-repo)

| Path | Topic |
|------|--------|
| `src/middleware.ts` | CSRF trigger, CSP, headers |
| `src/middleware/csrf.ts` | CSRF rules + exemptions |
| `src/lib/admin.ts` | Admin gate |
| `src/infrastructure/env.ts` | Env schema |
| `src/services/auth/rateLimit.ts` | Rate limiting tiers |
| `.github/workflows/ci.yml` | CI pipeline |

---

*Last updated: audit remediation pass (admin route, `ADMIN_EMAILS`, CI tests).*
