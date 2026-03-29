"""
contracts.py

Pydantic models derived from shared/contracts/OrchestratorResult.schema.json.

This is the single source of truth for the Python side of the pipeline contract.
When the JSON Schema changes, update this file in the same commit.

Import RunResponse from here; do not duplicate field definitions in main.py.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ─── Execution log entries ────────────────────────────────────────────────────

class AgentLogEntry(BaseModel):
    agent: str
    status: Literal["success", "error"]
    timestamp: int
    detail: str | None = None


class DecisionLogEntry(BaseModel):
    type: Literal["llm-decision"]
    issue: str
    action: str
    timestamp: int


# ─── Execution trace (LangGraph-only) ────────────────────────────────────────

class TraceEntry(BaseModel):
    node: str
    durationMs: float
    iteration: int
    inputSnap: dict[str, Any] | None = None
    outputSnap: dict[str, Any] | None = None
    skipped: bool = False


# ─── Metrics (LangGraph-only) ────────────────────────────────────────────────

class Metrics(BaseModel):
    latencyMs: float
    iterations: int
    agentCalls: int
    requiresHuman: bool


# ─── Pipeline stages ──────────────────────────────────────────────────────────

PipelineStage = Literal["planner", "research", "logistics", "budget_safety"]


# ─── OrchestratorResult ───────────────────────────────────────────────────────

class RunResponse(BaseModel):
    """
    Mirrors OrchestratorResult.schema.json exactly.
    Used as the FastAPI response model for POST /run.
    """
    ok: bool | None = None
    requiresHuman: bool | None = None
    stage: PipelineStage | None = None
    message: str | None = None
    context: dict[str, Any] | None = None
    executionLog: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    # LangGraph additions — not present in TS AgentOrchestrator responses
    executionTrace: list[TraceEntry] = Field(default_factory=list)
    metrics: Metrics | None = None
