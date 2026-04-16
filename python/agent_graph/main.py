"""
main.py

FastAPI entry point for the Python LangGraph orchestration service.

Endpoints:
  POST /run          Run the full pipeline; returns OrchestratorResult
  GET  /health       Liveness check

Query params for POST /run:
  ?debug=true        Include full execution trace + intermediate state snapshots
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

load_dotenv()

from .contracts import Metrics, RunResponse, TraceEntry  # noqa: E402
from .graph import compiled_graph                        # noqa: E402

app = FastAPI(
    title="VoyageAI LangGraph Orchestration Service",
    description=(
        "Python LangGraph service for the VoyageAI multi-agent pipeline.\n"
        "Nodes call the Next.js /api/internal/agent/execute endpoint to run\n"
        "TypeScript agents, keeping agent logic in a single implementation.\n\n"
        "Schema contract: shared/contracts/OrchestratorResult.schema.json\n"
    ),
    version="2.0.0",
)


class RunRequest(BaseModel):
    input: str
    request_id: str | None = None


# ─── Debug response (superset of RunResponse) ────────────────────────────────

class DebugRunResponse(RunResponse):
    """
    Extended response returned when ?debug=true.
    Includes intermediate node states in addition to the standard fields.
    """
    debugStates: list[dict[str, Any]] = []


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_metrics(
    final_state: dict[str, Any],
    terminal: dict[str, Any],
    run_start: float,
) -> Metrics:
    elapsed_ms = (time.monotonic() - run_start) * 1000
    return Metrics(
        latencyMs=round(elapsed_ms, 2),
        iterations=final_state.get("iteration_count", 0),
        agentCalls=final_state.get("agent_calls", 0),
        requiresHuman=bool(terminal.get("requiresHuman", False)),
    )


def _build_trace(final_state: dict[str, Any]) -> list[TraceEntry]:
    raw: list[dict[str, Any]] = final_state.get("execution_trace", [])
    result = []
    for entry in raw:
        try:
            result.append(TraceEntry(**entry))
        except Exception:
            pass
    return result


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "langgraph-orchestrator", "version": "2.0.0"}


@app.post("/run")
async def run_pipeline(
    body: RunRequest,
    debug: bool = Query(default=False, description="Return full execution trace and intermediate states"),
) -> RunResponse | DebugRunResponse:
    """
    Execute the full trip-planning pipeline via LangGraph.

    Normal mode: returns OrchestratorResult (same shape as TS AgentOrchestrator.run()).
    Debug mode (?debug=true): additionally returns executionTrace, metrics, and
    intermediate node states — useful for evaluation and coursework demos.
    """
    request_id = body.request_id or str(uuid.uuid4())
    run_start = time.monotonic()

    initial_state: dict[str, Any] = {
        "input": body.input,
        "request_id": request_id,
        "iteration_count": 0,
        "agent_calls": 0,
        "run_start_ms": time.time() * 1000,
        "execution_log": [],
        "execution_trace": [],
        "errors": [],
        "debug": debug,
        "debug_states": [],
    }

    try:
        final_state = await compiled_graph.ainvoke(initial_state)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    terminal: dict[str, Any] = final_state.get("terminal") or {}

    if not terminal:
        raise HTTPException(
            status_code=500,
            detail="Graph completed without producing a terminal result",
        )

    metrics   = _build_metrics(final_state, terminal, run_start)
    trace     = _build_trace(final_state)

    if debug:
        return DebugRunResponse(
            ok=terminal.get("ok"),
            requiresHuman=terminal.get("requiresHuman"),
            stage=terminal.get("stage"),
            message=terminal.get("message"),
            context=terminal.get("context"),
            executionLog=terminal.get("executionLog", []),
            error=terminal.get("error"),
            executionTrace=trace,
            metrics=metrics,
            debugStates=final_state.get("debug_states", []),
        )

    return RunResponse(
        ok=terminal.get("ok"),
        requiresHuman=terminal.get("requiresHuman"),
        stage=terminal.get("stage"),
        message=terminal.get("message"),
        context=terminal.get("context"),
        executionLog=terminal.get("executionLog", []),
        error=terminal.get("error"),
        executionTrace=trace,
        metrics=metrics,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("LANGGRAPH_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
