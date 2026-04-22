"""
metrics.py

Prometheus metrics definitions for the LangGraph orchestration service.

All instruments are module-level singletons; importing this module from
graph.py and main.py is safe (no double-registration).

Metric naming follows the OpenMetrics convention:
  <namespace>_<subsystem>_<name>_<unit>
"""

from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, REGISTRY

# ── Graph-level metrics ───────────────────────────────────────────────────────

langgraph_executions_total = Counter(
    "langgraph_executions_total",
    "Total LangGraph graph executions",
    ["status", "outcome"],          # status: success|error, outcome: ok|requires_human|error
)

langgraph_execution_duration_seconds = Histogram(
    "langgraph_execution_duration_seconds",
    "Total graph execution time in seconds",
    ["outcome"],
    buckets=[5, 10, 20, 30, 45, 60, 90, 120, 180],
)

langgraph_execution_steps_total = Counter(
    "langgraph_execution_steps_total",
    "Total number of node steps executed across all graph runs",
    ["outcome"],
)

langgraph_repair_iterations_total = Counter(
    "langgraph_repair_iterations_total",
    "Budget/density repair loop iterations",
    ["action"],   # reoptimize_budget | rerun_logistics | ask_user
)

langgraph_active_executions = Gauge(
    "langgraph_active_executions",
    "Number of graph executions currently in-flight",
)

# ── Node-level metrics (CRITICAL) ─────────────────────────────────────────────

langgraph_node_duration_seconds = Histogram(
    "langgraph_node_duration_seconds",
    "Per-node execution time in seconds",
    ["node", "status"],             # node: planner|research|logistics|budget|safety|validate
    buckets=[0.5, 1, 2, 5, 10, 20, 30, 60, 120],
)

langgraph_node_executions_total = Counter(
    "langgraph_node_executions_total",
    "Total node executions",
    ["node", "status"],             # status: success|error|skipped
)

langgraph_node_retries_total = Counter(
    "langgraph_node_retries_total",
    "Number of retries (tenacity) per node",
    ["node"],
)

langgraph_node_errors_total = Counter(
    "langgraph_node_errors_total",
    "Node execution errors by type",
    ["node", "error_type"],         # error_type: http_error|timeout|validation|unknown
)

# Bottleneck detection: track the slowest node across all runs
langgraph_node_max_duration_seconds = Gauge(
    "langgraph_node_max_duration_seconds",
    "Max observed node duration in seconds (running max, not a histogram)",
    ["node"],
)

# ── Flow behaviour metrics ────────────────────────────────────────────────────

langgraph_loop_detected_total = Counter(
    "langgraph_loop_detected_total",
    "Number of times the repair loop was entered (a node was repeated)",
)

langgraph_early_termination_total = Counter(
    "langgraph_early_termination_total",
    "Graph runs that terminated before reaching the terminal_output node",
    ["failed_at_node"],
)

langgraph_branch_path_total = Counter(
    "langgraph_branch_path_total",
    "Conditional edge paths taken",
    ["from_node", "to_node"],
)

# ── Agent-client (HTTP back to Next.js) ───────────────────────────────────────

langgraph_agent_call_duration_seconds = Histogram(
    "langgraph_agent_call_duration_seconds",
    "HTTP call latency to the Next.js /api/internal/agent/execute endpoint",
    ["step", "status"],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60],
)

langgraph_agent_call_retries_total = Counter(
    "langgraph_agent_call_retries_total",
    "Tenacity retry attempts on the agent HTTP client",
    ["step"],
)

# ── Service health ────────────────────────────────────────────────────────────

langgraph_requests_total = Counter(
    "langgraph_requests_total",
    "Total HTTP requests to the FastAPI service",
    ["method", "endpoint", "status_code"],
)

langgraph_request_duration_seconds = Histogram(
    "langgraph_request_duration_seconds",
    "FastAPI request latency",
    ["method", "endpoint"],
    buckets=[0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
)
