"""
graph.py

LangGraph StateGraph for the VoyageAI multi-agent trip planning pipeline.

Flow:
  planner → research → logistics → budget_safety → validate
                                        ↑
                                   repair_loop (≤ MAX_ITERATIONS)

Decision logic mirrors agentOrchestrator.ts exactly:
  over_budget  → reoptimize_budget → logistics again
  too_dense    → rerun_logistics   → logistics again
  both         → ask_user (human-in-the-loop)
  loop exhausted with unresolved issues → human-in-the-loop

Additions over the TS orchestrator (additive only, no behaviour change):
  - Per-node execution trace (node, durationMs, iteration, input/output snapshots)
  - Run-level metrics (latencyMs, iterations, agentCalls, requiresHuman)
  - Smart-skipping guard so the repair loop is never entered unnecessarily
  - Per-agent configurable timeout via AgentClient
"""

from __future__ import annotations

import time as _time
import uuid
from typing import Any, Literal, Optional, TypedDict

from langgraph.graph import StateGraph, END

from client import AgentClient, AgentClientError

# ─── Constants (match agentOrchestrator.ts) ───────────────────────────────────

MAX_ITERATIONS = 3
MAX_ACTIVITIES_BEFORE_DENSE = 4

# Per-agent HTTP timeout (seconds). Can be overridden via the AgentClient constructor.
DEFAULT_AGENT_TIMEOUT = 90.0


# ─── Graph state ──────────────────────────────────────────────────────────────

class PipelineState(TypedDict, total=False):
    """Complete mutable state passed between graph nodes."""

    # User-supplied input
    input: str
    request_id: str

    # Agent outputs (accumulated across steps)
    trip: Optional[dict[str, Any]]           # PlannerAgent output
    enriched: Optional[dict[str, Any]]       # ResearchAgent output
    optimized: Optional[dict[str, Any]]      # LogisticsAgent output
    last_safe: Optional[dict[str, Any]]      # BudgetAgent + SafetyAgent output

    # Repair loop bookkeeping
    iteration_count: int
    # Action that triggered the current logistics re-run ("reoptimize_budget" | "rerun_logistics").
    # None on the initial forward pass.
    repair_action: Optional[str]

    # Structured execution log (mirrors TS ExecutionLogEntry[])
    execution_log: list[dict[str, Any]]

    # Per-node observability trace (LangGraph addition)
    execution_trace: list[dict[str, Any]]

    # Run-level metrics (LangGraph addition)
    agent_calls: int
    run_start_ms: float

    # Debug mode: carry intermediate states
    debug: bool
    debug_states: list[dict[str, Any]]

    # Terminal signals
    errors: list[dict[str, Any]]             # {stage, message}
    terminal: Optional[dict[str, Any]]       # Final OrchestratorResult shape


# ─── Decision helpers (mirror agentOrchestrator.ts exactly) ──────────────────

def has_budget_issues(ctx: dict[str, Any]) -> bool:
    return bool(ctx.get("budget", {}).get("isOverBudget", False))


def is_too_dense(ctx: dict[str, Any]) -> bool:
    days: list[dict[str, Any]] = ctx.get("days", [])
    return any(len(d.get("activities", [])) > MAX_ACTIVITIES_BEFORE_DENSE for d in days)


def classify_issue(over_budget: bool, too_dense: bool) -> Literal["over_budget", "too_dense", "unknown"]:
    if over_budget and too_dense:
        return "unknown"
    if over_budget:
        return "over_budget"
    return "too_dense"


def decide_next_action(
    issue: Literal["over_budget", "too_dense", "unknown"],
) -> Literal["reoptimize_budget", "rerun_logistics", "ask_user", "proceed"]:
    """
    Deterministic decision matching the TS defaultDecideNextAction.
    No LLM call required for the base case.
    """
    if issue == "over_budget":
        return "reoptimize_budget"
    if issue == "too_dense":
        return "rerun_logistics"
    return "ask_user"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now_ms() -> int:
    return int(_time.time() * 1000)


def _log_entry(agent: str, status: str, detail: str | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {"agent": agent, "status": status, "timestamp": _now_ms()}
    if detail:
        entry["detail"] = detail
    return entry


def _log_decision(issue: str, action: str) -> dict[str, Any]:
    return {"type": "llm-decision", "issue": issue, "action": action, "timestamp": _now_ms()}


def _snap(data: Any, max_keys: int = 8) -> dict[str, Any]:
    """
    Return a compact, non-sensitive snapshot for trace entries.
    Keeps top-level scalar fields and summaries of collections.
    """
    if not isinstance(data, dict):
        return {"value": str(data)[:200]}
    snap: dict[str, Any] = {}
    for k, v in list(data.items())[:max_keys]:
        if isinstance(v, list):
            snap[k] = f"[{len(v)} items]"
        elif isinstance(v, dict):
            snap[k] = f"{{...{len(v)} keys}}"
        elif isinstance(v, (str, int, float, bool)) or v is None:
            snap[k] = v
    return snap


def _trace_entry(
    node: str,
    duration_ms: float,
    iteration: int,
    input_snap: dict[str, Any] | None = None,
    output_snap: dict[str, Any] | None = None,
    skipped: bool = False,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "node": node,
        "durationMs": round(duration_ms, 2),
        "iteration": iteration,
        "skipped": skipped,
    }
    if input_snap is not None:
        entry["inputSnap"] = input_snap
    if output_snap is not None:
        entry["outputSnap"] = output_snap
    return entry


# ─── Graph nodes ──────────────────────────────────────────────────────────────

_client = AgentClient(timeout=DEFAULT_AGENT_TIMEOUT)


async def planner_node(state: PipelineState) -> PipelineState:
    t0 = _time.monotonic()
    request_id = state.get("request_id", str(uuid.uuid4()))
    log   = list(state.get("execution_log", []))
    trace = list(state.get("execution_trace", []))
    calls = state.get("agent_calls", 0)
    iteration = state.get("iteration_count", 0)

    input_snap = {"inputLength": len(state.get("input", ""))}
    try:
        result = await _client.execute("planner", {"input": state["input"]}, request_id)
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("planner", "success"))
        trace.append(_trace_entry("planner", duration, iteration, input_snap, _snap(result)))
        return {
            **state,
            "trip": result,
            "execution_log": log,
            "execution_trace": trace,
            "agent_calls": calls + 1,
            "request_id": request_id,
        }
    except AgentClientError as exc:
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("planner", "error", str(exc)))
        trace.append(_trace_entry("planner", duration, iteration, input_snap, {"error": str(exc)}))
        terminal = {"ok": False, "stage": "planner", "error": str(exc), "executionLog": log}
        return {**state, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1, "terminal": terminal}


async def research_node(state: PipelineState) -> PipelineState:
    t0 = _time.monotonic()
    request_id = state.get("request_id", "")
    log   = list(state.get("execution_log", []))
    trace = list(state.get("execution_trace", []))
    calls = state.get("agent_calls", 0)
    iteration = state.get("iteration_count", 0)

    trip = state.get("trip", {})
    input_snap = _snap({"destination": trip.get("destination"), "durationDays": trip.get("durationDays")})
    try:
        result = await _client.execute("research", trip, request_id)
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("research", "success"))
        trace.append(_trace_entry("research", duration, iteration, input_snap, _snap(result)))
        return {**state, "enriched": result, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1}
    except AgentClientError as exc:
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("research", "error", str(exc)))
        trace.append(_trace_entry("research", duration, iteration, input_snap, {"error": str(exc)}))
        terminal = {"ok": False, "stage": "research", "context": trip, "error": str(exc), "executionLog": log}
        return {**state, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1, "terminal": terminal}


async def logistics_node(state: PipelineState) -> PipelineState:
    t0 = _time.monotonic()
    request_id = state.get("request_id", "")
    log   = list(state.get("execution_log", []))
    trace = list(state.get("execution_trace", []))
    calls = state.get("agent_calls", 0)
    iteration = state.get("iteration_count", 0)

    # Mirror agentOrchestrator.ts line 316: only inject the tighter budget preference
    # when the action was specifically "reoptimize_budget" (not "rerun_logistics").
    enriched = dict(state["enriched"])  # type: ignore[arg-type]
    last_safe = state.get("last_safe")
    repair_action = state.get("repair_action")
    if repair_action == "reoptimize_budget" and last_safe:
        prefs = last_safe.get("preferences") or {}
        if prefs.get("budget"):
            enriched = {**enriched, "preferences": {**(enriched.get("preferences") or {}), "budget": prefs["budget"]}}

    input_snap = _snap({"destination": enriched.get("destination"), "days": len(enriched.get("days", [])), "repair_action": repair_action})
    try:
        result = await _client.execute("logistics", enriched, request_id)
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("logistics", "success"))
        trace.append(_trace_entry("logistics", duration, iteration, input_snap, _snap(result)))
        return {**state, "optimized": result, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1}
    except AgentClientError as exc:
        duration = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("logistics", "error", str(exc)))
        trace.append(_trace_entry("logistics", duration, iteration, input_snap, {"error": str(exc)}))
        terminal = {"ok": False, "stage": "logistics", "context": state.get("enriched"), "error": str(exc), "executionLog": log}
        return {**state, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1, "terminal": terminal}


async def budget_safety_node(state: PipelineState) -> PipelineState:
    t0_total = _time.monotonic()
    request_id = state.get("request_id", "")
    log   = list(state.get("execution_log", []))
    trace = list(state.get("execution_trace", []))
    calls = state.get("agent_calls", 0)
    iteration = state.get("iteration_count", 0)

    optimized = state.get("optimized", {})

    # ── Budget ─────────────────────────────────────────────────────────────────
    t0 = _time.monotonic()
    budget_input_snap = _snap({"selectedHotel": (optimized.get("selectedHotel") or {}).get("name")})
    try:
        budgeted = await _client.execute("budget", optimized, request_id)
        dur = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("budget", "success"))
        trace.append(_trace_entry("budget", dur, iteration, budget_input_snap, _snap(budgeted.get("budget", {}))))
        calls += 1
    except AgentClientError as exc:
        dur = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("budget", "error", str(exc)))
        trace.append(_trace_entry("budget", dur, iteration, budget_input_snap, {"error": str(exc)}))
        terminal = {"ok": False, "stage": "budget_safety", "context": optimized, "error": str(exc), "executionLog": log}
        return {**state, "execution_log": log, "execution_trace": trace, "agent_calls": calls + 1, "terminal": terminal}

    # ── Safety ─────────────────────────────────────────────────────────────────
    t0 = _time.monotonic()
    safety_input_snap = _snap({"isOverBudget": budgeted.get("budget", {}).get("isOverBudget")})
    try:
        safe = await _client.execute("safety", budgeted, request_id)
        dur = (_time.monotonic() - t0) * 1000
        log.append(_log_entry("safety", "success"))
        trace.append(_trace_entry("safety", dur, iteration, safety_input_snap, _snap(safe.get("safety", {}))))
        calls += 1
    except AgentClientError:
        dur = (_time.monotonic() - t0) * 1000
        # Downgrade to safe default — same behaviour as agentOrchestrator.ts
        safe = {**budgeted, "safety": {"riskLevel": "low", "warnings": [], "tips": []}}
        log.append(_log_entry("safety", "error", "downgraded to safe default"))
        trace.append(_trace_entry("safety", dur, iteration, safety_input_snap, {"riskLevel": "low", "downgraded": True}))
        calls += 1

    return {**state, "last_safe": safe, "execution_log": log, "execution_trace": trace, "agent_calls": calls}


async def validate_node(state: PipelineState) -> PipelineState:
    """
    Runs the repair-loop decision. Called after budget_safety_node.

    Smart-skipping guard (Section 4): if neither over_budget nor too_dense,
    emits terminal immediately without entering the loop — zero extra calls.
    This short-circuit was already present in the TS while condition; making
    it explicit here documents the guard and makes it traceable.
    """
    t0 = _time.monotonic()
    last_safe  = state.get("last_safe", {})
    log        = list(state.get("execution_log", []))
    trace      = list(state.get("execution_trace", []))
    iteration  = state.get("iteration_count", 0)

    over_budget = has_budget_issues(last_safe)
    dense       = is_too_dense(last_safe)

    def _finish_trace(action_taken: str, skipped: bool = False) -> None:
        dur = (_time.monotonic() - t0) * 1000
        trace.append(_trace_entry(
            "validate",
            dur,
            iteration,
            {"over_budget": over_budget, "too_dense": dense, "iteration": iteration},
            {"action": action_taken},
            skipped=skipped,
        ))

    # ── Smart skip: no issues → done ─────────────────────────────────────────
    if not over_budget and not dense:
        _finish_trace("ok", skipped=True)
        terminal = {
            "ok": True,
            "requiresHuman": False,
            "context": last_safe,
            "executionLog": log,
        }
        return {**state, "execution_log": log, "execution_trace": trace, "terminal": terminal}

    # ── Exhausted loop ────────────────────────────────────────────────────────
    if iteration >= MAX_ITERATIONS:
        still_budget = has_budget_issues(last_safe)
        still_dense  = is_too_dense(last_safe)
        if still_budget and still_dense:
            message = "Trip exceeds budget and the schedule is very packed. Optimize or proceed?"
        elif still_budget:
            message = "Trip exceeds budget. Optimize or proceed?"
        else:
            message = "Trip itinerary is very packed. Proceed or optimize?"
        _finish_trace("exhausted_hitl")
        terminal = {
            "ok": False,
            "requiresHuman": True,
            "stage": "budget_safety",
            "message": message,
            "context": last_safe,
            "executionLog": log,
        }
        return {**state, "execution_log": log, "execution_trace": trace, "terminal": terminal}

    # ── Decide ────────────────────────────────────────────────────────────────
    issue  = classify_issue(over_budget, dense)
    action = decide_next_action(issue)
    log.append(_log_decision(issue, action))

    if action == "ask_user":
        _finish_trace("ask_user_hitl")
        terminal = {
            "ok": False,
            "requiresHuman": True,
            "stage": "budget_safety",
            "message": "Trip needs adjustment. Proceed or optimize?",
            "context": last_safe,
            "executionLog": log,
        }
        return {**state, "execution_log": log, "execution_trace": trace, "terminal": terminal}

    if action == "proceed":
        _finish_trace("proceed")
        terminal = {
            "ok": True,
            "requiresHuman": False,
            "context": last_safe,
            "executionLog": log,
        }
        return {**state, "execution_log": log, "execution_trace": trace, "terminal": terminal}

    # ── Loop back ─────────────────────────────────────────────────────────────
    # Store the action so logistics_node applies the correct context mutation.
    _finish_trace(action)
    return {
        **state,
        "execution_log": log,
        "execution_trace": trace,
        "iteration_count": iteration + 1,
        "repair_action": action,
    }


def terminal_node(state: PipelineState) -> PipelineState:
    """No-op node; graph ends here so the terminal result is readable."""
    return state


# ─── Routing functions ────────────────────────────────────────────────────────

def route_after_planner(state: PipelineState) -> str:
    return "terminal_output" if state.get("terminal") else "research"


def route_after_research(state: PipelineState) -> str:
    return "terminal_output" if state.get("terminal") else "logistics"


def route_after_logistics(state: PipelineState) -> str:
    return "terminal_output" if state.get("terminal") else "budget_safety"


def route_after_validate(state: PipelineState) -> str:
    if state.get("terminal"):
        return "terminal_output"
    return "logistics"


# ─── Build graph ──────────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("planner",       planner_node)
    graph.add_node("research",      research_node)
    graph.add_node("logistics",     logistics_node)
    graph.add_node("budget_safety", budget_safety_node)
    graph.add_node("validate",      validate_node)
    graph.add_node("terminal_output", terminal_node)

    graph.set_entry_point("planner")

    graph.add_conditional_edges("planner",       route_after_planner,   {"research": "research",    "terminal_output": "terminal_output"})
    graph.add_conditional_edges("research",      route_after_research,  {"logistics": "logistics",  "terminal_output": "terminal_output"})
    graph.add_conditional_edges("logistics",     route_after_logistics, {"budget_safety": "budget_safety", "terminal_output": "terminal_output"})
    graph.add_edge("budget_safety", "validate")
    graph.add_conditional_edges("validate",      route_after_validate,  {"logistics": "logistics",  "terminal_output": "terminal_output"})
    graph.add_edge("terminal_output", END)

    return graph.compile()


compiled_graph = build_graph()
