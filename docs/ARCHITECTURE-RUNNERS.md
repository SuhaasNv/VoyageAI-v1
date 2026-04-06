# Execution runners: what actually runs where

This document complements `docs/architecture.md` by naming the **three ways** the multi-agent trip pipeline can be executed, and which one the product uses today.

## 1. UI-driven flow (production path for the itinerary overlay)

**Who:** Authenticated users in the dashboard itinerary creation overlay (`ItineraryCreationFlow`).

**How:** The browser performs **five sequential** `POST` requests:

- `/api/ai/itinerary-flow/planner`
- `/api/ai/itinerary-flow/research`
- `/api/ai/itinerary-flow/logistics`
- `/api/ai/itinerary-flow/budget`
- `/api/ai/itinerary-flow/safety`

Each route constructs the corresponding TypeScript agent class and calls `run()`. The **client** owns stage transitions, loading state, and retries; the server does not run a single “mega” orchestrator for this path.

**Persistence:** Saving uses `/api/ai/itinerary-flow/save`, which adapts the final `SafeTripContext` into the stored itinerary shape.

This is the **primary production path** for the staged itinerary UX.

## 2. TypeScript `AgentOrchestrator` (library + fallback)

**Who:** Callers that import `AgentOrchestrator` from `src/orchestrator/agentOrchestrator.ts`.

**How:** `new AgentOrchestrator(deps).run(input)` runs Planner → Research → Logistics → Budget → Safety **in one process**, including validation/repair loop logic and execution logging.

**Production HTTP:** This class is **not** mounted as a public API route for the itinerary overlay. It is used for:

- Unit tests (`src/orchestrator/__tests__/`)
- **Fallback** when the LangGraph bridge cannot reach the Python service or when the service response fails contract validation (`runViaLangGraph`).

So it is **authoritative TS behavior** for the full pipeline, but **not** what the browser calls step-by-step in the main UI.

## 3. LangGraph (Python) + internal execute route

**Who:** The Python service (`python/agent_graph/main.py`, `POST /run`) and its graph (`graph.py`).

**How:** Each graph node calls the Next.js internal endpoint `POST /api/internal/agent/execute` with a shared secret header. That route runs the **same** TypeScript agent classes as the UI routes, so agent logic stays in one codebase.

**TypeScript bridge:** `runViaLangGraph()` in `agentOrchestrator.ts` calls the Python `POST /run`, validates the JSON against `OrchestratorResultSchema`, and falls back to `AgentOrchestrator.run()` on network errors, non-OK HTTP, or schema validation failure.

**Production today:** The dashboard itinerary overlay does **not** call `runViaLangGraph`. The Python stack is for **advanced orchestration**, parity testing, coursework/demos, or future consolidation (e.g. a single-shot API). Operators enable it by running the Python service and setting `LANGGRAPH_SERVICE_URL` and `INTERNAL_AGENT_SECRET` consistently on both sides.

## Summary

| Runner | Used by main itinerary UI? | Typical use |
|--------|----------------------------|-------------|
| 5× `/api/ai/itinerary-flow/*` | **Yes** | Production staged UX |
| `AgentOrchestrator.run` | No (directly) | Tests, TS reference, `runViaLangGraph` fallback |
| Python LangGraph + `/api/internal/agent/execute` | No (unless you add a caller) | Optional service, parity / experiments |

When changing pipeline rules, consider whether you must update **both** `agentOrchestrator.ts` and `python/agent_graph/graph.py` if you rely on LangGraph parity; the **UI path** only picks up changes in the agents and the five flow routes.
