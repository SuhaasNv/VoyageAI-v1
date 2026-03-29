# VoyageAI — Production Architecture Audit

**Document type:** As-built architecture and gap analysis (codebase audit).  
**Stack verified against:** Next.js 16 App Router, Prisma 7, PostgreSQL, in-repo `src/` (March 2026).

---

## Visual architecture (Mermaid)

### Simple system overview (easy to explain)

Use this for **quick walkthroughs** (stakeholders, interviews, README). It hides internal splits (tools vs agents, Redis, etc.) and shows the four ideas that matter: **people**, **one app**, **data**, **AI**.

```mermaid
flowchart TB
  subgraph People["Who"]
    U["Travelers"]
    A["Admins"]
  end

  subgraph App["VoyageAI — one Next.js application"]
    UI["Web UI<br/>React"]
    API["APIs<br/>auth · trips · AI · admin"]
    UI --> API
  end

  subgraph Data["Where data lives"]
    DB[("PostgreSQL<br/>users · trips · itineraries · chats · logs")]
  end

  subgraph Intelligence["How AI helps"]
    FEAT["Itineraries · chat · reoptimize · suggestions · admin assistant"]
    LLM["OpenAI or Gemini<br/>(+ optional fallbacks)"]
    FEAT --> LLM
  end

  U --> UI
  A --> UI
  API --> DB
  API --> FEAT
```

**One-sentence version:** Users and admins use a **single Next.js app**; the app talks to **PostgreSQL** for accounts and trip data, and to **cloud LLMs** through a small **AI layer** that powers planning, chat, and operations tools.

**Slightly longer:** The browser UI and server APIs live in the same codebase. Authenticated requests create or update trips and itineraries in the database. When someone asks for an AI itinerary or chat reply, the API calls the AI layer, which formats prompts and returns structured results—then the app saves what needs to persist.

---

### Whole system — layers, data stores, and dual AI paths

The diagram shows **how the shipped product talks to AI** (tools + routes) versus the **multi-agent pipeline** (orchestrator + agents), which shares the same LLM and persistence primitives.

```mermaid
flowchart TB
  subgraph Client["Client"]
    B["Browser — React 19"]
  end

  subgraph Next["Next.js App Router — src/app"]
    P["Pages<br/>dashboard · trip · chat · landing · admin UI"]
    R_AI["API routes<br/>/api/ai/*"]
    R_APP["API routes<br/>/api/trips · auth · …"]
    R_ADM["API routes<br/>/api/admin/*"]
  end

  subgraph Sec["Cross-cutting — src/security · lib/api"]
    AUTH["JWT / cookies · getAuthContext"]
    CSRF["CSRF — X-CSRF-Token"]
    RL["Rate limit — Redis or memory"]
    ZOD["Zod validateBody"]
  end

  subgraph ProductPath["Product AI path — src/tools"]
    IT["itineraryTool"]
    CH["chatTool"]
    RE["reoptimizeTool"]
    PK["packing · simulation · suggestions …"]
  end

  subgraph AgentPath["Agent pipeline — src/orchestrator + src/agents"]
    ORCH["AgentOrchestrator.run()"]
    subgraph Agents["Agents"]
      PL["PlannerAgent"]
      RS["ResearchAgent"]
      LG["LogisticsAgent"]
      BG["BudgetAgent"]
      SF["SafetyAgent"]
    end
  end

  subgraph AI["AI runtime — src/lib/ai"]
    MR["modelRouter.selectModelConfig"]
    MS["modelSelector — admin insights"]
    LLM["LLMClientFactory + executeWithRetry"]
    HEAL["healingStore overrides"]
  end

  subgraph Providers["Providers"]
    OAI["OpenAI"]
    GEM["Gemini"]
    MOCK["Mock — dev only"]
  end

  subgraph External["External"]
    BD["Bright Data — web search"]
  end

  subgraph Data["Data"]
    PG[("PostgreSQL — Prisma<br/>Trip · Itinerary · ChatMessage · logs")]
    RD[("Upstash Redis<br/>rate limits · cache keys")]
  end

  subgraph Mem["Context / memory — src/memory · lib/ai"]
    TP["TravelPreference → travelDNARules"]
    MEM["In-process session memory"]
    ASM["assembleContext"]
  end

  subgraph Svc["Services — src/services"]
    RP["agentReplayLogger → AgentExecutionLog"]
    USG["usageLogger → AiUsageLog"]
    ADM["admin: assistant · autoHeal · autonomous · actionExecutor"]
  end

  B --> P
  P --> R_AI & R_APP
  P --> R_ADM

  R_AI --> AUTH & CSRF & RL & ZOD
  R_APP --> AUTH & RL & ZOD
  R_ADM --> AUTH & RL

  R_AI --> IT & CH & RE & PK
  IT & CH & RE & PK --> MR
  MR --> HEAL --> LLM
  LLM --> OAI & GEM & MOCK

  CH --> TP & MEM & ASM
  IT --> TP

  R_AI --> PG
  R_APP --> PG
  LLM --> USG
  IT & CH & RE & PK --> PG

  ORCH --> PL --> RS --> LG --> BG --> SF
  RS --> BD
  PL & RS & LG & BG & SF --> LLM
  ORCH -.->|"repair-loop<br/>decision JSON"| LLM
  ORCH --> RP
  R_ADM --> ADM
  ADM --> LLM & PG & RD & MS

  RL --> RD

  NOTE["Note: Orchestrator is not invoked from<br/>/api/ai/* today — tests / programmatic only"]
  ORCH -.-> NOTE
```

### Agents — orchestrator sequence, repair loop, and outputs

```mermaid
flowchart TB
  IN(["Input: natural language string"])

  subgraph S0["Pipeline — fixed order"]
    IN --> PL["① PlannerAgent<br/>LLM JSON → TripContext"]
    PL --> RS["② ResearchAgent<br/>Parallel: Bright Data + LLM<br/>→ EnrichedTripContext"]
    RS --> LG["③ LogisticsAgent<br/>LLM schedule + merge, else deterministic<br/>→ OptimizedTripContext"]
    LG --> BS["④ BudgetAgent → ⑤ SafetyAgent<br/>TS cost math + LLM suggestions if over budget<br/>LLM risk JSON + heuristics"]
  end

  BS --> GATE{"Over budget OR<br/>>4 activities / day?"}

  GATE -->|No| OK(["Result: ok — SafeTripContext"])
  GATE -->|Yes| LOOP["Repair loop — ≤3 LLM decisions"]

  subgraph S1["LLM decision — hybrid"]
    LOOP --> DEC["defaultDecideNextAction<br/>JSON: reoptimize_budget | rerun_logistics |<br/>ask_user | proceed"]
    DEC -->|parse fail| FB["Rule fallback:<br/>reoptimize_budget"]
  end

  DEC --> ACT{"Action?"}
  FB --> ACT

  ACT -->|ask_user| H1(["requiresHuman: true"])
  ACT -->|proceed| OK
  ACT -->|rerun_logistics<br/>or reoptimize_budget| LG2["LogisticsAgent.run again<br/>optional: inject budget prefs"]
  LG2 --> BS2["Budget + Safety again"]
  BS2 --> GATE

  BS2 -.->|"if repair loop<br/>exits after 3 decisions<br/>and issues remain"| H2(["requiresHuman: true<br/>exhausted loop"])

  subgraph Log["Per requestId"]
    RP["runWithReplayLog → AgentExecutionLog<br/>+ in-memory executionLog"]
  end

  PL -.-> RP
  RS -.-> RP
  LG -.-> RP
  BS -.-> RP
  LG2 -.-> RP
  BS2 -.-> RP

  style OK fill:#1a3d2e,color:#fff
  style H1 fill:#4a3728,color:#fff
  style H2 fill:#4a3728,color:#fff
```

**How to read the agent diagram:** Steps ①–⑤ always run once. The **repair loop** only activates when budget or density checks fail; the small **orchestrator LLM** chooses the next remediation. **`ask_user`** returns **human-in-the-loop** immediately. The **dashed line** to `H2` is the **exhausted-loop** path (three decision rounds used, constraints still violated, user did not choose `proceed`).

---

## 1. System overview

**What VoyageAI is:** A travel planning web application where authenticated users create trips, generate AI itineraries, chat about trips, reoptimize plans, and use ancillary AI features (packing lists, risk simulation, dashboard suggestions). Admin users get an operations dashboard with AI-assisted diagnostics and optional autonomous/healing hooks.

**Core capabilities:**

- JWT/cookie-based auth with refresh rotation; role-aware admin area.
- Trip CRUD and itinerary persistence (`Trip`, `Itinerary`, `ChatMessage`).
- Multiple **AI tools** exposed as REST routes under `/api/ai/*` (itinerary, chat, reoptimize, packing, simulation, landing prompt bar, create-trip-from-text, etc.).
- A separate **multi-agent pipeline** (Planner → Research → Logistics → Budget → Safety) implemented as TypeScript classes and coordinated by `AgentOrchestrator`.

**Key differentiators (intended design):**

- **AI:** Structured JSON outputs, Zod-validated requests, sanitization and post-generation checks; primary OpenAI with Gemini fallback via retry layer; optional auto-healing overrides on model config.
- **Agents:** Specialized agents with clear boundaries (research uses web grounding; budget uses deterministic math; logistics merges LLM scheduling back onto canonical activity objects).
- **Autonomy (admin):** Anomaly-driven proposals, guard-enforced action allow-lists, and execution of safe admin actions — distinct from the main user itinerary path.

**Critical architectural fact:** The **product-facing itinerary and chat flows do not call `AgentOrchestrator`**. They call **`src/tools/*`** directly from API routes. The orchestrator is implemented and unit-tested but **not wired to HTTP** in the current codebase.

---

## 2. Tech stack

| Layer | Technology |
|--------|------------|
| **Frontend** | React 19, Next.js 16 App Router, Tailwind 4, Framer Motion, Mapbox GL, D3, Zustand, `@dnd-kit` |
| **Backend** | Next.js Route Handlers (`src/app/api/**`), server-side services under `src/services`, `src/tools` |
| **AI providers** | OpenAI (`@` API via custom client), Google Gemini (`@google/generative-ai`), dev **MockLLMClient** when keys/provider unset |
| **Database** | PostgreSQL via Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`, `pg`) |
| **Cache / rate limit** | Upstash Redis (`@upstash/redis`) in production; in-memory fallback for rate limiting in dev |
| **Security** | bcryptjs, jsonwebtoken, signed CSRF tokens (HMAC), cookie-based session material |
| **Testing** | Vitest (`src/orchestrator/__tests__/`, tool tests) |

---

## 3. High-level architecture

### Canonical user path (actual production shape)

```
User → Browser (React) → Next.js API Route → Tool/service layer → LLMClient (+ optional Bright Data) → PostgreSQL → JSON response → UI
```

### Agent pipeline path (implemented, not exposed as primary API)

```
Natural language (string) → AgentOrchestrator.run() → sequential agents → in-memory TripContext graph → OrchestratorResult (no default persistence)
```

### Request lifecycle (typical authenticated AI call)

1. Client sends `POST` with JSON body; many mutating calls include `X-CSRF-Token`.
2. Route uses `validateBody` (Zod), `getAuthContext` (JWT from header or cookie), ownership checks on `Trip` where applicable.
3. `checkRateLimit('ai:<userId>:<endpoint>')` runs (Redis or memory).
4. Optional: `getTravelPreferenceContext` / `assembleContext` / `buildMemoryContext` inject preferences and session context.
5. Tool invokes `selectModelConfig({ endpoint })` (and sometimes `executeWithRetry`) to call the LLM.
6. Output validated/sanitized; itinerary paths may transactionally write `Itinerary` + update `Trip`.
7. Errors mapped via `formatErrorResponse` (includes provider busy → 503 patterns where implemented).

### Key boundaries

- **API routes:** HTTP, auth, rate limits, persistence orchestration.
- **Tools (`src/tools`):** Use-case-specific prompts and parsing; primary integration point for product AI.
- **Agents (`src/agents`):** Specialized steps for the multi-agent trip graph; consumed by `AgentOrchestrator` only.
- **LLM layer (`src/lib/ai`):** Provider abstraction, retries, usage logging, model routing tables.

---

## 4. Orchestrator design (critical)

### Location and entry point

- **File:** `src/orchestrator/agentOrchestrator.ts`
- **Class:** `AgentOrchestrator`
- **Public API:** `run(input: string): Promise<OrchestratorResult>`

### How it is triggered

- **In repository:** Instantiation appears in **`src/orchestrator/__tests__/agentOrchestrator.test.ts` only**. No `src/app/api/**` route imports `AgentOrchestrator`.
- **Implication:** The orchestrator is a **first-class subsystem** for pipeline logic and replay logging, but **not the live user-facing itinerary generator**.

### Agent selection model

- **Not dynamic “pick one agent.”** The orchestrator runs a **fixed pipeline**:
  1. Planner  
  2. Research  
  3. Logistics  
  4. Budget + Safety (paired)

**LLM involvement in routing:** Only inside the **post-validation loop**. After the first budget+safety pass, if the trip is **over budget** and/or **too dense** (more than four activities on any day), the orchestrator calls `decideNextAction` (default: `defaultDecideNextAction`).

- That decider is **hybrid**:
  - **LLM:** Small JSON decision `{ "action": "reoptimize_budget" | "rerun_logistics" | "ask_user" | "proceed" }` with temperature 0.
  - **Rule fallback:** Invalid JSON, LLM failure, or unknown action → **`reoptimize_budget`**.
  - **Rule thresholds:** `MAX_ITERATIONS = 3` for decision rounds; dense-day threshold aligned with safety heuristics.

### Flow: User intent → orchestrator → execution → response

1. **Input:** Single free-text string (user trip intent).
2. **Planner** produces `TripContext` (destination, dates, themes, preferences).
3. **Research** enriches days and hotels (Bright Data + LLM).
4. **Logistics** assigns time slots and picks a hotel (LLM with deterministic fallback).
5. **Budget** computes costs in TypeScript; optional LLM suggestions when over budget.
6. **Safety** runs heuristics + LLM JSON risk assessment (`executeWithRetry`).
7. **Validation loop:** Re-run logistics (optionally with budget preference injected) + budget + safety until resolved, max three LLM decisions, or **human-in-the-loop** return (`requiresHuman: true`).

### Fallback, errors, retries

- **Per-stage errors:** Failure in planner/research/logistics returns `ok: false` with `stage` set; budget failure aborts stage; safety failure in orchestrator is caught and **downgraded** to a safe default context (`riskLevel: "low"`, empty warnings) so the pipeline can complete.
- **Logistics:** Up to two LLM attempts; then **deterministic** slot assignment + hotel scoring.
- **Research:** Two full attempts at LLM+validation if the first fails.
- **Planner:** JSON repair pass via second LLM call if parse fails once.
- **LLM provider level:** `executeWithRetry` implements exponential backoff and can switch to alternate provider on rate limits when keys exist (see `src/lib/ai/llm.ts`).

### Observability hook

- `runWithReplayLog` (`src/services/ai/agentReplayLogger.ts`) writes **sanitized** rows to `AgentExecutionLog` when Prisma delegate is available, correlated by `requestId`.

---

## 5. Agent system

Below: **pipeline agents** used by `AgentOrchestrator`. These are separate from the **tool** layer that powers `/api/ai/itinerary`, etc.

### Planner Agent (`src/agents/planner/plannerAgent.ts`)

| Aspect | Detail |
|--------|--------|
| **Purpose** | Turn natural language into a structured `TripContext` (destination, duration, dates, themed days, preferences). |
| **Inputs** | `input: string`, optional `requestId` for logs. |
| **Outputs** | `TripContext` after `validateAndNormalize` (defaults for invalid duration/dates; style/pace enums enforced). |
| **Tools** | None external. |
| **LLM** | `LLMClientFactory.create({ agent: "planner" })` → OpenAI **`gpt-4.1`** when provider is OpenAI; JSON response, repair path on bad JSON. |
| **Example task** | “4 days in Lisbon, relaxed pace, $2000 budget” → structured plan with day themes. |

### Research Agent (`src/agents/research/researchAgent.ts`)

| Aspect | Detail |
|--------|--------|
| **Purpose** | Enrich each day with 3–5 activities and **3–5 hotel options total**; must not pick final hotel or compute totals. |
| **Inputs** | `TripContext`. |
| **Outputs** | `EnrichedTripContext` (`days` with activities, `hotels[]`). |
| **Tools** | **Bright Data** searches: `searchAttractions`, `searchHotels`, `searchRestaurants` (`src/tools/brightDataTool.ts`). |
| **LLM** | `buildFullPrompt` + `selectModelConfig({ endpoint: "research" })` + `executeWithRetry`; validates/sanitizes output; merges onto input days. |
| **Example task** | Ground “museums day” with real venue names from search snippets, output JSON matching schema. |

### Logistics Agent (`src/agents/logistics/logisticsAgent.ts`)

| Aspect | Detail |
|--------|--------|
| **Purpose** | Assign `morning|afternoon|evening` slots, reorder for variety, select **one** hotel from the provided list. |
| **Inputs** | `EnrichedTripContext`. |
| **Outputs** | `OptimizedTripContext` (scheduled activities + `selectedHotel`). |
| **Tools** | None external; preprocessing caps activities by pace. |
| **LLM** | Primary path: LLM JSON → `mergeLLMResult` (strict match to original activity names/types); **deterministic fallback** if validation fails. |
| **Example task** | Ensure no consecutive same-type activities; prefer central hotel when budget is tight. |

### Budget Agent (`src/agents/budget/budgetAgent.ts`)

| Aspect | Detail |
|--------|--------|
| **Purpose** | Estimate per-day and total cost; flag `isOverBudget`; optional textual suggestions. |
| **Inputs** | `OptimizedTripContext`. |
| **Outputs** | `BudgetedTripContext` with `budget` object. |
| **Tools** | None. |
| **LLM** | Only when over budget — small JSON suggestions via `selectModelConfig({ endpoint: "budget" })` and retry wrapper; **numbers are always TS-computed**. |
| **Example task** | User budget $1500 vs estimated $2200 → `budgetGap` + three suggestion strings. |

### Safety Agent (`src/agents/safety/safetyAgent.ts`)

| Aspect | Detail |
|--------|--------|
| **Purpose** | Fatigue, weather/crowd, and budget-stress signals; produce `riskLevel`, warnings, tips. |
| **Inputs** | `BudgetedTripContext`. |
| **Outputs** | `SafeTripContext` (`safety` block). |
| **Tools** | None; keyword/heuristic **pre-analysis** feeds the prompt. |
| **LLM** | `executeWithRetry`, JSON response, then `validateAndClamp` for consistency. |
| **Example task** | Packed days + famous landmarks → medium/high risk with concise warnings. |

---

## 6. Tool layer

**Location:** `src/tools/`

| Tool | Role |
|------|------|
| `itineraryTool.ts` | Full itinerary generation for dashboard; caching key; uses central prompts/schemas; **primary path for `/api/ai/itinerary`**. |
| `reoptimizeTool.ts` | Structured diff / reoptimization against existing itinerary. |
| `chatTool.ts` | Trip-scoped conversational companion. |
| `suggestionTool.ts` | Dashboard contextual suggestions. |
| `packingTool.ts` | Packing list generation. |
| `simulationTool.ts` | Trip risk / simulation style output. |
| `brightDataTool.ts` | Web search grounding (used by Research agent; not exclusive to agents). |

**How agents call tools:** Only **ResearchAgent** imports Bright Data tools directly. Other agents avoid cross-calls.

**Separation of concerns:** API routes should stay thin: validate auth, load DB entities, call **one** tool, persist results. The **orchestrator** composes **agents**, not `itineraryTool`, which keeps two parallel AI architectures in the codebase.

---

## 7. Data flow (end-to-end)

### Create trip

Typical pattern: UI → `POST /api/trips` or AI-assisted create routes → Prisma `Trip` insert → redirect/load dashboard. (Exact route chosen by UI; all persist through Prisma.)

### Generate itinerary (**product**)

`User` → `TimelineItinerary` (or similar) → `POST /api/ai/itinerary` → `generateItinerary` → LLM → validate → **transaction:** delete prior `Itinerary` rows for trip, insert new `Itinerary.rawJson`, update `Trip.budgetTotal` / `budgetCurrency` → UI refresh.

**Note:** This path does **not** run the five pipeline agents.

### Reoptimize trip

`User` → `POST /api/ai/reoptimize` → `reoptimizeTool` → LLM (diff-shaped output) → validate → persist/update (per route implementation) → UI.

### AI chat

`User` → `POST /api/ai/chat` → load `Trip` + latest `Itinerary` → `assembleContext` + **session memory** (`memory/memory.ts`) + travel preferences → `chatCompanion` → persist `ChatMessage` rows → UI.

### Suggestions

Dashboard → `POST` to suggestions API (see `suggestionTool` + route) → short JSON suggestion list → UI.

### Agent pipeline (if invoked programmatically)

`string` → `AgentOrchestrator.run` → sequential agents → `OrchestratorResult` → optional `AgentExecutionLog` rows — **no default write to `Itinerary` in orchestrator code**.

---

## 8. Memory and context

| Mechanism | Implementation | Notes |
|-----------|----------------|-------|
| **Travel DNA** | `User.preferences` (onboarding), `TravelPreference.data` JSON | `buildTravelDNARules` turns preference JSON into prompt rules. |
| **Embeddings / vector RAG** | `storeTravelDNA` / `getTravelDNA` in `memory/contextStore.ts` | **Stubs** — return null / no-op; not production RAG. |
| **Session memory** | `memory/memory.ts` | In-process `Map`, rolling window + compressed preamble; **not durable** across cold starts / multi-instance. |
| **Chat history** | Request payload + `ChatMessage` table | Chat route merges DB trip data with message list. |
| **Context injection** | `lib/ai/context.ts` (`assembleContext`) | Bundles DNA, itinerary snapshot, trip meta, chat, optional extras into prompt-facing text. |

---

## 9. AI system design

### Model routing

- **Static routing:** `selectModelConfig({ endpoint, intent? })` in `modelRouter.ts` maps logical endpoints (`itinerary`, `chat`, `reoptimize`, …) to model names, temperature, max tokens, timeouts for OpenAI/Gemini/mock matrices.
- **Provider resolution:** `LLM_PROVIDER` env + key presence; production rejects mock client.
- **Per-agent OpenAI models:** `AGENT_MODELS` in `llm.ts` (e.g. planner/logistics → `gpt-4.1`, research/budget/safety/orchestrator → `gpt-4.1-mini`).
- **Auto-healing overlays:** `applyHealingOverrides` adjusts config based on `healingStore` (driven by admin/auto-heal/autonomous flows).

### Dynamic cost/quality routing (partial integration)

- **`modelSelector.ts`** implements data-driven selection from `AiUsageLog` aggregates with caching and scoring.
- **Current usage:** exposed for **admin insights** (`/api/admin/model-insights`); **not** wired into main `itineraryTool` / chat tools (commentary in file: “call in any new service”).

### Prompt structure

- Agents: dedicated prompt modules (`plannerPrompts`, `researchPrompts`, logistics inline system prompt, etc.).
- Tools: centralized prompt fragments (`lib/ai/prompts`, `SYSTEM_PROMPTS`, `SCHEMA_INSTRUCTIONS`).

### Schema validation

- HTTP layer: Zod schemas in `lib/ai/schemas` and route-local extensions (e.g. require `tripId`).
- LLM output: JSON parse + custom validators per agent/tool; `AIServiceError` codes for validation failures; `validateLLMOutput` for injection-style checks on persisted content.

### Fallback logic (OpenAI → Gemini, etc.)

- **`executeWithRetry`:** Retries with backoff; on certain errors / rate limits can flip to alternate provider client when keys exist.
- **Logistics / Planner:** Application-level second attempt or deterministic fallback (not provider switch).
- **Mock client:** Development-only; blocked in production in `LLMClientFactory`.

---

## 10. Admin and autonomous system

### Admin dashboard

- **Layout:** `src/app/admin/layout.tsx` — `requireAdmin()` gates access; renders nav, header, **`AdminAssistant`** sidebar/widget.
- **Pages (examples):** agents trace UI, AI metrics, cache, logs, explanations — backed by `/api/admin/*` routes.

### AI assistant

- **`/api/admin/assistant`:** Conversational admin helper (structured to propose actions, not arbitrary shell).

### Action executor

- **`src/services/admin/actionExecutor.ts`:** Typed actions (`CHECK_AI_PROVIDER`, `CHECK_API_LOGS`, `VERIFY_MONITORING`, `CLEAR_CACHE`, `ANALYZE_USERS`). Results logged to **`AdminActionLog`**.

### Anomaly detection and auto-heal

- **`anomalyDetector` / `autoHealing.service`:** Read metrics (e.g. from `AiUsageLog` and health aggregations), detect anomalies, **LLM or rule-based** decision, apply bounded healing actions, audit trail.

### Autonomous mode

- **`autonomousRunner.ts`:** Periodic or triggered cycle — analyze → propose actions → **`guard.ts`** validates against `AUTONOMY_MODE` (`OFF` | `SAFE` | `FULL`), confidence ≥ 0.7, per-anomaly cooldown → optional execution affecting routing knobs (e.g. prefer Gemini, token caps).

### Guard layer

- Enforces allow-lists: **SAFE** vs **FULL** vs **OFF**; rejects low-confidence or disallowed proposals; in-memory cooldown registry (resets on process restart).

### Explainability

- **`AiDecisionLog`** model + explanation service/API for recording decision type, source, reasoning summary, confidence, outcome.

---

## 11. Observability

| Signal | Mechanism |
|--------|-----------|
| **LLM usage** | `logLLMUsage` / `logLLMCallFailure` → **`AiUsageLog`** (tokens, latency, cost estimate, `callSucceeded`, `requestId`, `endpoint`) |
| **Agent pipeline steps** | **`AgentExecutionLog`** via `agentReplayLogger` (orchestrator runs) |
| **Admin actions** | **`AdminActionLog`** |
| **AI decisions** | **`AiDecisionLog`** |
| **Structured logs** | `logStructured` / `logInfo` / `logError` in infrastructure logger |
| **Latency** | Per-call `latencyMs` on LLM responses and agent replay rows |
| **Error tracking** | Application logs + DB failure rows; **no first-party Sentry SDK** observed in source (dependencies may pull OTEL transitively via Next). |

---

## 12. Security

| Control | Implementation |
|---------|----------------|
| **Authentication** | JWT access token (header or cookie); refresh token family rotation in DB; `getAuthContext` on API routes |
| **Authorization** | Trip ownership checks; admin role via `requireAdmin` |
| **CSRF** | Signed token (`csrf.edge` / cookie); client sends `X-CSRF-Token` on mutating requests |
| **Rate limiting** | `checkRateLimit` — Redis in production, memory in dev; DB model `RateLimitEntry` exists for fallback patterns |
| **Input hygiene** | `sanitizeUserInput`, Zod validation, `validateLLMOutput` where applied |
| **Secrets** | Env validation (`infrastructure/env.ts`); production requires real `CSRF_SECRET` |

---

## 13. Current gaps

1. **Orchestrator not wired to product APIs** — The five-agent pipeline is isolated; users consume `itineraryTool`, not `AgentOrchestrator`.
2. **`agentRegistry.ts` is an empty stub** — No runtime discovery or plugin registration.
3. **Dual AI architectures** — Risk of drift: two different ways to produce trips (tool vs agents); maintenance and product semantics must stay aligned intentionally.
4. **`modelSelector` unused in hot path** — Cost/speed optimization engine exists but main tools use static `modelRouter` only.
5. **Travel DNA RAG stubs** — No embedding-backed retrieval; preferences are JSON → rules string only.
6. **Session memory is process-local** — Unreliable in multi-instance or aggressive serverless scaling without shared store.
7. **Bright Data dependency** — Research agent degrades to LLM-only when grounding is empty; quality depends on external search availability/config.
8. **Safety agent throws on LLM failure** — Orchestrator masks with default “low” safety; may hide real failures from callers that bypass orchestrator.
9. **Observability** — Strong DB logging; no distributed tracing standard across all paths documented in code.

---

## 14. Production readiness (qualitative scores)

Scores are **1–5** (5 = production-grade for a Series A–style SaaS). They reflect **what is implemented**, not aspirational docs.

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Architecture** | **3.5** | Clear layering; two parallel AI paths create conceptual debt; admin subsystem is thoughtful. |
| **Agents** | **4** (code) / **2** (product integration) | Agents are well-factored and tested but **not** on the main user itinerary path. |
| **AI system** | **4** | Solid provider abstraction, retries, usage logging, healing hooks; dynamic selector underutilized. |
| **Reliability** | **3.5** | Good fallbacks in logistics and LLM retry; in-memory memory and optional external search weaken guarantees. |
| **Scalability** | **3** | Stateless API design fits horizontal scale; Redis rate limits OK; Prisma/Postgres standard; session memory and singleton LLM client warrant review at high concurrency. |

---

## Summary for engineers and reviewers

VoyageAI is a **Next.js monolith** with a **mature tool-based AI surface** for users and a **separately engineered multi-agent pipeline** that implements orchestration, replay logging, and human-in-the-loop repair logic. For academic or stakeholder evaluation: treat the **orchestrator** as a **reference implementation** of agent coordination until it is **explicitly invoked** from an API route or service that replaces or complements `generateItinerary`.

---

## 15. Hybrid LangGraph integration

### Overview

The `feat-langraph-integration` branch adds a **Python LangGraph service** as the orchestration layer while keeping all five TypeScript agents unchanged. This separates two orthogonal concerns:

| Concern | Owner |
| ------- | ----- |
| **Orchestration** — graph flow, conditional edges, repair loop, human-in-the-loop decisions | Python `LangGraph` |
| **Agent capabilities** — prompts, LLM calls, structured output, Bright Data | TypeScript (unchanged) |

### Architecture diagram

```mermaid
flowchart TB
  subgraph caller ["Callers"]
    UI["Browser / API route"]
    TEST["Vitest / pytest"]
  end

  subgraph ts ["Next.js (TypeScript)"]
    BRIDGE["runViaLangGraph()<br/>agentOrchestrator.ts"]
    FALLBACK["AgentOrchestrator.run()<br/>TS fallback"]
    INTERNAL["POST /api/internal/agent/execute<br/>X-Internal-Agent-Secret"]
    AGENTS["PlannerAgent · ResearchAgent<br/>LogisticsAgent · BudgetAgent · SafetyAgent"]
    REPLAY["runWithReplayLog()<br/>AgentExecutionLog (DB)"]
  end

  subgraph py ["Python LangGraph service (:8000)"]
    GRAPH["StateGraph<br/>compiled_graph"]
    PLNODE["planner_node"]
    RESNODE["research_node"]
    LOGNODE["logistics_node"]
    BSNODE["budget_safety_node"]
    VALNODE["validate_node<br/>repair loop ≤ 3"]
    CLIENT["AgentClient (httpx)"]
  end

  UI --> BRIDGE
  BRIDGE -->|"HTTP POST /run"| GRAPH
  BRIDGE -->|"on error / no service"| FALLBACK
  TEST --> FALLBACK

  GRAPH --> PLNODE --> RESNODE --> LOGNODE --> BSNODE --> VALNODE
  VALNODE -->|"over_budget or too_dense"| LOGNODE
  VALNODE -->|"ask_user / exhausted"| GRAPH

  PLNODE & RESNODE & LOGNODE & BSNODE --> CLIENT
  CLIENT -->|"HTTP POST + secret"| INTERNAL
  INTERNAL --> AGENTS
  AGENTS --> REPLAY
```

### Call sequence: one happy-path trip

```mermaid
sequenceDiagram
  participant Caller
  participant Bridge as runViaLangGraph (TS)
  participant Graph as LangGraph /run (Python)
  participant Internal as /api/internal/agent/execute (TS)
  participant Agent as *Agent.run() (TS)

  Caller->>Bridge: runViaLangGraph("Trip to Tokyo")
  Bridge->>Graph: POST /run {input}
  Graph->>Internal: POST /execute {step:"planner", payload}
  Internal->>Agent: PlannerAgent.run()
  Agent-->>Internal: TripContext
  Internal-->>Graph: {result: TripContext}
  Graph->>Internal: POST /execute {step:"research", payload}
  Internal->>Agent: ResearchAgent.run()
  Agent-->>Internal: EnrichedTripContext
  Internal-->>Graph: {result: EnrichedTripContext}
  Note over Graph: … logistics → budget → safety …
  Graph->>Graph: validate_node: ok, no issues
  Graph-->>Bridge: OrchestratorResult {ok:true}
  Bridge-->>Caller: OrchestratorResult
```

### Repair loop (human-in-the-loop)

```mermaid
flowchart LR
  BS["budget_safety_node"]
  VAL["validate_node"]
  LOG["logistics_node"]
  HITL(["requiresHuman: true"])
  OK(["ok: true"])

  BS --> VAL
  VAL -->|"no issues"| OK
  VAL -->|"over_budget → reoptimize_budget<br/>too_dense → rerun_logistics"| LOG
  LOG --> BS
  VAL -->|"ask_user OR loop exhausted after 3 rounds"| HITL
```

### Key files

| File | Role |
| ---- | ---- |
| [`python/agent_graph/graph.py`](../python/agent_graph/graph.py) | LangGraph `StateGraph`; control flow, repair loop, routing |
| [`python/agent_graph/client.py`](../python/agent_graph/client.py) | Typed `httpx` client; retries; secret header |
| [`python/agent_graph/main.py`](../python/agent_graph/main.py) | FastAPI `POST /run`; mirrors `OrchestratorResult` |
| [`python/agent_graph/requirements.txt`](../python/agent_graph/requirements.txt) | Pinned Python deps |
| [`src/app/api/internal/agent/execute/route.ts`](../src/app/api/internal/agent/execute/route.ts) | Internal dispatch route; secret auth; `runWithReplayLog` |
| [`src/orchestrator/agentOrchestrator.ts`](../src/orchestrator/agentOrchestrator.ts) | `runViaLangGraph()` bridge + fallback |
| [`src/orchestrator/__tests__/langGraphParity.test.ts`](../src/orchestrator/__tests__/langGraphParity.test.ts) | Parity + fallback tests (unit + optional live) |

### Design tradeoffs

| Tradeoff | Rationale |
| --------- | --------- |
| **Extra HTTP hops** (1 per agent step) | Acceptable for coursework and small-scale production; eliminates complete Python re-implementation of 5 agents |
| **LangGraph.js vs Python** | Python has more mature checkpointing, tooling, and documentation. JS considered and rejected to avoid a younger dependency surface |
| **Separate service vs in-process** | Explicit separation makes graph control flow independently testable and observable |
| **TS orchestrator kept as fallback** | Zero-downtime rollout; any Python service outage is invisible to users |
| **Deterministic `decideNextAction`** | TS removes the LLM call for decisions that can be fully determined by issue type; Python mirrors this — no quality loss, lower cost |

### Local development setup

```bash
# Terminal 1 — Next.js
cp .env.example .env  # set INTERNAL_AGENT_SECRET=dev-secret
npm run dev

# Terminal 2 — Python LangGraph service
cd python/agent_graph
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
NEXT_INTERNAL_URL=http://localhost:3000 \
INTERNAL_AGENT_SECRET=dev-secret \
python main.py
```

### Running tests

```bash
# Unit + parity (mocked — no Python needed)
npm test

# Live integration (Python service must be running)
LANGGRAPH_INTEGRATION=true npm test -- langGraphParity
```

### Environment variables

| Variable | Where | Purpose |
| -------- | ----- | ------- |
| `INTERNAL_AGENT_SECRET` | Next.js | Validates `X-Internal-Agent-Secret` header |
| `NEXT_INTERNAL_URL` | Python | Base URL of Next.js (e.g. `http://localhost:3000`) |
| `LANGGRAPH_SERVICE_URL` | Next.js | URL of Python service (default `http://localhost:8000`) |
| `LANGGRAPH_PORT` | Python | Port for uvicorn (default `8000`) |

---

## 16. Why hybrid LangGraph architecture

### Core thesis

The hybrid design **separates two orthogonal concerns** that are consistently conflated in simpler systems:

- **Orchestration** (which step runs next, when to loop, when to escalate, conditional routing) — owned by Python LangGraph
- **Agent capabilities** (prompts, LLM calls, structured output, external APIs) — owned by TypeScript agents

This separation is not just aesthetic. It reflects a fundamental engineering principle: **control flow and computation should not be coupled** in the same abstraction. LangGraph makes control flow first-class (explicit nodes, typed edges, conditional routing, checkpoints). TypeScript agents make LLM computation first-class (typed prompts, Zod-validated output, provider abstraction, retry).

### Why not keep the TS-only orchestrator?

The existing [`AgentOrchestrator`](../src/orchestrator/agentOrchestrator.ts) is well-implemented, but has structural limitations:

| Limitation | Impact |
|------------|--------|
| Control flow is implicit `while`/`if` code | Hard to visualise, test, or extend without reading the full function |
| No native checkpointing | Cannot pause/resume across process restarts |
| No step-level observability without adding custom logging at every branch | Observability is bolted-on, not structural |
| Hard to extend with conditional branching (e.g., add a new agent mid-loop) | Requires modifying a 350-line function |

LangGraph addresses all four with **graphs** (visual, explicit edges), **checkpointers** (optional persistence), **per-node hooks** (structural observability), and **declarative routing** (add nodes without touching existing logic).

### Why not use LangGraph.js (TypeScript)?

At the time of this decision:

| Criterion | LangGraph.js | Python `langgraph` |
|-----------|-------------|-------------------|
| Checkpointing/persistence | Beta, limited backends | Mature, PostgreSQL + SQLite |
| Community examples | Thin | Extensive |
| Ecosystem (tools, memory) | Early | Production-proven |
| Debugging tools (LangSmith) | Partial | Full |
| Stability of API | Frequent minor breaking changes | Stable minor versions |

The JS version was considered seriously and rejected on maturity grounds. The HTTP bridge cost (see below) is a known, bounded tradeoff — not a design mistake.

### Why not a full Python rewrite of agents?

Rewriting five TypeScript agents in Python would:

1. **Duplicate business logic** across two languages — schemas, prompts, Zod validation, model routing all have to be kept in sync
2. **Double maintenance burden** for every agent change
3. **Risk prompt drift** — slight rewording across languages can change model behaviour unexpectedly
4. **Discard existing test coverage** — 50+ Vitest tests covering agent behaviour and orchestrator parity

The HTTP bridge preserves TypeScript as the single source of agent truth. Python is responsible for *when* to call them, not *how*.

### Latency cost of HTTP

Each agent call crosses a network boundary (loopback in the same host/pod, one hop in a compose network). Measured overhead:

| Scenario | Added latency |
|----------|-------------|
| Same host (loopback) | ~1–3 ms per call |
| Same compose network | ~2–5 ms per call |
| Cross-pod Kubernetes | ~5–15 ms per call |

A pipeline with no repair loop makes **5 agent calls** × ~3 ms ≈ **15 ms total overhead**. With one repair iteration (7–8 calls), the overhead is still under 30 ms — negligible compared to LLM call latency (typically 1,000–8,000 ms per agent).

The `metrics.latencyMs` field in every `/run` response makes this measurable per-run in production.

### Benefits of explicit graph

```
planner → research → logistics → budget_safety → validate
                                       ↑                ↓ (repair)
                                   logistics ←──────────┘
```

1. **Visual, testable control flow** — the graph definition is 15 lines; the TS orchestrator's equivalent logic is ~80 lines of imperative code
2. **Conditional edges are contracts** — routing functions are pure functions with a finite set of outputs (`"terminal"`, `"logistics"`, etc.) — trivial to unit-test
3. **Per-node trace is structural** — `executionTrace` in every response is not added-on logging; it is a natural product of node boundaries
4. **Extensibility without surgery** — adding a new node (e.g., `recommendation_node` after safety) is one `add_node + add_edge` call, not modifying a monolithic `run()` method
5. **Human-in-the-loop is a first-class graph outcome** — not a special-cased return value buried in a loop condition

### Observability and evaluation

The v2.0 service returns three observability artifacts on every `/run` call:

| Artifact | Contents | Used for |
|----------|----------|---------|
| `executionLog` | Agent-level success/error entries (TS-compatible) | Existing admin replay UI |
| `executionTrace` | Per-node: `durationMs`, `iteration`, `inputSnap`, `outputSnap`, `skipped` | Performance analysis, bottleneck detection |
| `metrics` | `latencyMs`, `iterations`, `agentCalls`, `requiresHuman` | A/B evaluation, academic reporting |

With `?debug=true`, the `/run` endpoint additionally returns `debugStates` — a snapshot of intermediate pipeline state at each node boundary. This is invaluable for coursework demos and debugging unexpected repair-loop behaviour without a live debugger.

### Contract drift prevention

The `shared/contracts/OrchestratorResult.schema.json` is the single source of truth for the pipeline result shape. TypeScript derives its Zod schema from `shared/contracts/orchestratorResult.ts`; Python derives its Pydantic model from `python/agent_graph/contracts.py`. Both files reference the JSON Schema in comments. A change to the contract requires updating all three files in the same commit — the compiler and Pydantic validator catch drift at development time, not production runtime.

---

*End of document.*
