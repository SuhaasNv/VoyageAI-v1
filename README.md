# 🚀 VoyageAI — Intelligent Multi-Agent Travel Planner

### 🔥 One-line pitch (VERY IMPORTANT)
VoyageAI turns a free-text travel brief into a staged, reviewable itinerary pipeline where each agent is explicit, auditable, and persisted step-by-step instead of hidden behind a single black-box LLM call.

---

## 🧠 Problem

- Trip planners are often either static templates or opaque chatbots with weak traceability.
- Users need **cost control**, **safety checks**, and **route realism**, not just generic recommendations.
- Final-year AI systems need to defend: reliability under failure, explainability claims, and security controls under adversarial input.

---

## 💡 Solution Overview

- VoyageAI implements a **multi-agent staged planner**: users approve each stage before moving forward.
- Each stage has a narrow responsibility (plan, research, logistics, budget, safety).
- Outputs are persisted with metadata (`_meta`) so decisions are inspectable in UI/admin rather than hidden in prompts.

---

## ⚙️ System Architecture (CRITICAL)

Canonical architecture in production is **client-orchestrated staged execution**.

- Orchestration happens in `src/ui/components/itinerary-flow/ItineraryCreationFlow.tsx`.
- Backend API routes execute one agent per stage under `src/app/api/ai/itinerary-flow/*`.
- Final output is saved by `src/app/api/ai/itinerary-flow/save/route.ts` into Prisma/Postgres.

Flow:

1. User opens itinerary creation flow UI.
2. `planner` route returns `TripContext`.
3. `research` route enriches to `EnrichedTripContext`.
4. `logistics` route optimizes to `OptimizedTripContext`.
5. `budget` route computes `BudgetedTripContext`.
6. `safety` route returns `SafeTripContext`.
7. `save` route persists itinerary JSON and marks trip completed.

Production vs non-production paths:

- **Production path:** staged `/api/ai/itinerary-flow/*`.
- **Legacy path:** `/api/ai/itinerary` (kept for backward compatibility).
- **Experimental path:** `src/orchestrator/agentOrchestrator.ts` + LangGraph bridge/internal endpoint (not primary browser runtime).

---

## 🤖 Agent Design

- **Planner**
  - Role: parse user intent and create day themes.
  - I/O: `input string -> TripContext`.
  - Nature: LLM-assisted parsing + deterministic normalization.

- **Research**
  - Role: gather activities/hotels from external data.
  - I/O: `TripContext -> EnrichedTripContext`.
  - Nature: mixed LLM + external data tooling (Bright Data, geocoding support).

- **Logistics**
  - Role: sequence activities, assign slots, choose route/hotel strategy.
  - I/O: `EnrichedTripContext -> OptimizedTripContext`.
  - Nature: largely deterministic optimization logic.

- **Budget**
  - Role: estimate costs and detect over-budget conditions.
  - I/O: `OptimizedTripContext -> BudgetedTripContext`.
  - Nature: deterministic calculations, with optional LLM phrasing in parts of UX.

- **Safety**
  - Role: apply risk rules and produce warnings/tips.
  - I/O: `BudgetedTripContext -> SafeTripContext`.
  - Nature: deterministic rule engine with optional LLM-generated advice text.

---

## 🔍 Explainability & Responsible AI

- Stage responses use `formatAIResponse()` (`src/lib/ai/explainability.ts`) to attach:
  - `confidence`
  - `confidenceType`
  - `reasoning`
  - `sources`
  - optional `durationMs` and `decisionsLog`.
- Confidence in `src/lib/ai/confidence.ts` is explicitly **heuristic** (`base score - penalties`), not calibrated probability.
- Admin explainability logs persist decision records (`AiDecisionLog`) via `src/services/ai/explanation.service.ts`.

What is explainable:

- Stage-level metadata and reasoning strings.
- Decision logs for assistant/auto-heal/autonomous actions in admin.

What is not fully explainable:

- Confidence is not statistically calibrated.
- Some reasoning entries are narrative summaries, not event-sourced causal traces.

---

## 🔐 Security & Reliability

- **Validation:** Zod-based request schemas and shared `validateBody()` pipeline.
- **Prompt/input safety:** `sanitizeUserInput()` and output checks in `src/security/safety.ts`.
- **Auth:** JWT access + rotating refresh token family with revocation.
- **CSRF:** double-submit cookie + HMAC checks in proxy/middleware layer.
- **Rate limiting:** Redis-backed controls with endpoint-specific behavior.
- **Fallbacks:** provider fallbacks (OpenAI/Gemini paths), cache fallbacks, staged UI retry handling.

Known caveats (important):

- AI rate limiting has fail-open behavior on Redis infra errors in some paths.
- Security posture is stronger on auth endpoints than uniformly across every AI route.

---

## 🧪 Testing & Evaluation

- **Unit/integration:** Vitest (`npm test`) on core logic and contracts.
- **E2E:** dedicated tests exist under `tests/e2e/*` for itinerary/security behavior.
- **CI gates:** lint/type/build + model/data/prompt/safety scripts + SAST/SCA/DAST workflows.

What is real vs mocked:

- CI AI checks frequently run with mock provider settings for determinism/speed.
- E2E covers production-like route paths, but default `npm test` excludes `tests/e2e/*`.

Reliability proven vs assumed:

- Proven: compile/type checks, core tests, route generation, CI security pipeline execution.
- Assumed/partial: full live-provider behavior under all third-party outage conditions.

---

## 🛠 Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, Framer Motion
- **Backend:** Next.js API routes (`src/app/api/*`)
- **AI:** OpenAI/Gemini provider integration + route-level model routing
- **DB:** Prisma + PostgreSQL
- **Infra:** Redis caching/rate limit, Docker (Next + LangGraph service), Terraform (DigitalOcean), GitHub Actions
- **External APIs:** Bright Data, Mapbox, Pexels, Google OAuth

---

## 📊 Admin & Observability

Admin surface (`src/app/admin/*`) includes:

- system health and latency/error windows
- AI usage metrics and cost estimates
- agent replay traces
- explainability decision logs
- cache control operations

Why this matters:

- Enables auditability for viva/demo.
- Distinguishes pipeline failures, model issues, and ops signals instead of relying on anecdotal UI behavior.

---

## ⚠️ Limitations (IMPORTANT — boosts grade)

- Canonical runtime is staged client orchestration, while legacy/experimental paths still exist (possible architecture confusion if not explained clearly).
- Confidence is heuristic or metric-derived (e.g., R² in prediction contexts), not calibrated correctness probability.
- Third-party dependency risk remains (LLM providers, Bright Data, Mapbox, Redis).
- E2E coverage is present but not in default Vitest execution path.
- Some admin metrics are operational estimates, not billing-grade truth.

---

## 🚀 How to Run

1. Install dependencies

```bash
npm ci
```

2. Configure environment (`.env`)

High-level required variables:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `CSRF_SECRET`
- `LLM_PROVIDER` + provider key (`OPENAI_API_KEY` or `GEMINI_API_KEY`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Common optional integrations:

- `REDIS_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `PEXELS_API_KEY`
- `BRIGHT_DATA_API_KEY`
- `LANGGRAPH_SERVICE_URL`, `INTERNAL_AGENT_SECRET`

3. Prepare database

```bash
npx prisma generate
npx prisma migrate dev
```

4. Run app

```bash
npm run dev
```

5. Recommended validation before demo

```bash
npm run type-check
npm run build
npm test
```

---

## 🎯 Final Note

VoyageAI is strong because it treats trip generation as a **transparent systems problem** (staged agents, contracts, metadata, admin observability), not just a prompt-engineering demo.  
To reach clear A+ maturity, the next step is tighter architectural consolidation (single narrative path) and stronger empirical calibration/evaluation of AI confidence and safety behavior.
