/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚗  EXPERIMENTAL ORCHESTRATION — NOT ON ANY PRODUCTION HTTP ROUTE       ║
 * ║                                                                          ║
 * ║  AgentOrchestrator runs the full agent pipeline (planner → research →   ║
 * ║  logistics → budget → safety) in a single in-process call with an       ║
 * ║  LLM-driven re-try loop (MAX_ITERATIONS = 3).                           ║
 * ║                                                                          ║
 * ║  PRODUCTION PATH: each agent stage is an independent HTTP route under   ║
 * ║  /api/ai/itinerary-flow/* orchestrated by ItineraryCreationFlow.tsx.    ║
 * ║                                                                          ║
 * ║  This class is used ONLY by tests and the LangGraph parity harness.     ║
 * ║  Do NOT wire it to a production API route without a full security and   ║
 * ║  timeout review.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { PlannerAgent, type TripContext } from "@/agents/planner/plannerAgent";
import { ResearchAgent, type EnrichedTripContext } from "@/agents/research/researchAgent";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";
import {
    BudgetAgent,
    type BudgetedTripContext,
    type OptimizedTripContext,
} from "@/agents/budget/budgetAgent";
import { SafetyAgent, type SafeTripContext } from "@/agents/safety/safetyAgent";
import { logStructured, generateRequestId, logError } from "@/infrastructure/logger";
import { env } from "@/infrastructure/env";
import { runWithReplayLog } from "@/services/ai/agentReplayLogger";
import { OrchestratorResultSchema } from "../../shared/contracts/orchestratorResult";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 3;

/**
 * Days with more than this many activities are treated as "too dense".
 * Aligned with SafetyAgent's fatigue threshold (>4 = medium, >5 = high).
 */
const MAX_ACTIVITIES_BEFORE_DENSE = 4;

// ─── Public types ─────────────────────────────────────────────────────────────

export type OrchestratorAction =
    | "reoptimize_budget"
    | "rerun_logistics"
    | "ask_user"
    | "proceed";

export type ExecutionLogEntry =
    | { agent: string; status: "success" | "error"; timestamp: number; detail?: string }
    | { type: "llm-decision"; issue: string; action: OrchestratorAction; timestamp: number };

/** Discriminated union returned by AgentOrchestrator.run(). */
export type OrchestratorResult =
    | {
          ok: true;
          requiresHuman: false;
          context: SafeTripContext;
          executionLog: ExecutionLogEntry[];
      }
    | {
          requiresHuman: true;
          message: string;
          context: SafeTripContext;
          executionLog: ExecutionLogEntry[];
      }
    | {
          ok: false;
          stage: "planner" | "research" | "logistics" | "budget_safety";
          context?: TripContext | EnrichedTripContext | OptimizedTripContext;
          executionLog: ExecutionLogEntry[];
          error?: string;
      };

export type AgentOrchestratorDeps = {
    planner?: PlannerAgent;
    research?: ResearchAgent;
    logistics?: LogisticsAgent;
    budget?: BudgetAgent;
    safety?: SafetyAgent;
    /** Override for the decision function — useful in tests. */
    decideNextAction?: (input: DecideInput) => Promise<{ action: OrchestratorAction }>;
};

// ─── Internal types ───────────────────────────────────────────────────────────

export type DecideInput = {
    issue: "over_budget" | "too_dense" | "unknown";
    context: unknown;
};

// ─── Deterministic decision helper ────────────────────────────────────────────
//
// Replaces a prior LLM call that spent 128 tokens on a choice fully determined
// by the issue classification:
//   over_budget  → reoptimize_budget (hint logistics to pick a cheaper hotel)
//   too_dense    → rerun_logistics   (re-order activities without changing cost)
//   both / other → ask_user          (conflicting goals need human input)
//
// This removes ~1 round-trip LLM call per validation-loop iteration with no
// loss of decision quality (the LLM had no additional signal beyond issue type).

function defaultDecideNextAction(
    input: DecideInput,
): Promise<{ action: OrchestratorAction }> {
    let action: OrchestratorAction;
    switch (input.issue) {
        case "over_budget":
            action = "reoptimize_budget";
            break;
        case "too_dense":
            action = "rerun_logistics";
            break;
        default:
            action = "ask_user";
    }
    return Promise.resolve({ action });
}

// ─── Validation helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function maxActivitiesInDay(ctx: { days?: Array<{ activities?: unknown[] }> }): number {
    let m = 0;
    for (const d of ctx.days ?? []) {
        const n = d.activities?.length ?? 0;
        if (n > m) m = n;
    }
    return m;
}

function isTooDense(ctx: { days?: Array<{ activities?: unknown[] }>; preferences?: { pace?: string } }): boolean {
    // Fast-pace trips legitimately have 5 activities/day — only flag above that.
    const cap = ctx.preferences?.pace?.toLowerCase().includes("fast")
        ? MAX_ACTIVITIES_BEFORE_DENSE + 1
        : MAX_ACTIVITIES_BEFORE_DENSE;
    return (ctx.days ?? []).some((d) => (d.activities?.length ?? 0) > cap);
}

function hasBudgetIssues(ctx: { budget?: { isOverBudget?: boolean } }): boolean {
    return Boolean(ctx.budget?.isOverBudget);
}

function classifyIssue(overBudget: boolean, tooDense: boolean): DecideInput["issue"] {
    if (overBudget && tooDense) return "unknown";
    if (overBudget) return "over_budget";
    return "too_dense";
}

// ─── AgentOrchestrator ────────────────────────────────────────────────────────

export class AgentOrchestrator {
    readonly executionLog: ExecutionLogEntry[] = [];

    private readonly planner: PlannerAgent;
    private readonly research: ResearchAgent;
    private readonly logistics: LogisticsAgent;
    private readonly budget: BudgetAgent;
    private readonly safety: SafetyAgent;
    private readonly decide: (input: DecideInput) => Promise<{ action: OrchestratorAction }>;

    constructor(deps: AgentOrchestratorDeps = {}) {
        this.planner = deps.planner ?? new PlannerAgent();
        this.research = deps.research ?? new ResearchAgent();
        this.logistics = deps.logistics ?? new LogisticsAgent();
        this.budget = deps.budget ?? new BudgetAgent();
        this.safety = deps.safety ?? new SafetyAgent();
        this.decide = deps.decideNextAction ?? defaultDecideNextAction;
    }

    private logAgent(agent: string, status: "success" | "error", detail?: string): void {
        this.executionLog.push({ agent, status, timestamp: Date.now(), detail });
    }

    private logLlmDecision(issue: string, action: OrchestratorAction): void {
        this.executionLog.push({ type: "llm-decision", issue, action, timestamp: Date.now() });
    }

    // ── Private helper: run budget then safety on a given optimized context ───

    private _budgetStepIndex = 3;
    private _safetyStepIndex = 4;

    private async runBudgetAndSafety(
        opt: OptimizedTripContext,
        requestId?: string,
    ): Promise<SafeTripContext | undefined> {
        const budgetIdx = this._budgetStepIndex++;
        const safetyIdx = this._safetyStepIndex++;

        let budgeted: BudgetedTripContext | undefined;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "budget" } });
            budgeted = await runWithReplayLog({
                requestId: requestId ?? "unknown",
                agentName: "budget", stepIndex: budgetIdx,
                input: { selectedHotel: opt.selectedHotel?.name },
                run: () => this.budget.run(opt, requestId),
                buildOutputSummary: (r) => ({ totalEstimatedCost: r.budget.totalEstimatedCost, isOverBudget: r.budget.isOverBudget }),
            });
            this.logAgent("budget", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "budget", totalCost: budgeted.budget.totalEstimatedCost, isOverBudget: budgeted.budget.isOverBudget } });
        } catch (err) {
            this.logAgent("budget", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "budget", error: (err as Error).message } });
            return undefined;
        }

        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "safety" } });
            const safe = await runWithReplayLog({
                requestId: requestId ?? "unknown",
                agentName: "safety", stepIndex: safetyIdx,
                input: { isOverBudget: budgeted.budget.isOverBudget },
                run: () => this.safety.run(budgeted!, requestId),
                buildOutputSummary: (r) => ({ riskLevel: r.safety.riskLevel, warningCount: r.safety.warnings.length }),
            });
            this.logAgent("safety", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "safety", riskLevel: safe.safety.riskLevel } });
            return safe;
        } catch (err) {
            this.logAgent("safety", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "safety", error: (err as Error).message } });
            return { ...budgeted, safety: { riskLevel: "high" as const, warnings: [{ type: "travel" as const, day: 0, severity: "high" as const, message: "Safety analysis failed — this itinerary may contain risks." }], tips: [] } };
        }
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async run(input: string): Promise<OrchestratorResult> {
        this.executionLog.length = 0;
        this._budgetStepIndex = 3;
        this._safetyStepIndex = 4;
        const requestId = generateRequestId();
        logStructured({ layer: "orchestrator", step: "start", requestId, data: { inputLength: input.length } });

        // Step 1: Planner
        let trip: TripContext;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "planner" } });
            trip = await runWithReplayLog({
                requestId, agentName: "planner", stepIndex: 0,
                input: { promptLength: input.length },
                run: () => this.planner.run(input, requestId),
                buildOutputSummary: (r) => ({ destination: r.destination, durationDays: r.durationDays, daysPlanned: r.days.length }),
            });
            this.logAgent("planner", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "planner", destination: trip.destination, durationDays: trip.durationDays } });
            if (trip.destination === "Top Travel Destination") {
                return { ok: false, stage: "planner", executionLog: this.executionLog, error: "Destination is too vague — please specify a city or region." };
            }
        } catch (err) {
            this.logAgent("planner", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "planner", error: (err as Error).message } });
            return { ok: false, stage: "planner", executionLog: this.executionLog, error: (err as Error).message };
        }

        // Step 2: Research
        let enriched: EnrichedTripContext;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "research", destination: trip.destination } });
            enriched = await runWithReplayLog({
                requestId, agentName: "research", stepIndex: 1,
                input: { destination: trip.destination, durationDays: trip.durationDays },
                run: () => this.research.run(trip, requestId),
                buildOutputSummary: (r) => ({ days: r.days.length, hotels: r.hotels.length }),
            });
            this.logAgent("research", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "research", days: enriched.days.length, hotels: enriched.hotels.length } });
        } catch (err) {
            this.logAgent("research", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "research", error: (err as Error).message } });
            return { ok: false, stage: "research", context: trip, executionLog: this.executionLog, error: (err as Error).message };
        }

        // Step 3: Logistics
        let optimized: OptimizedTripContext;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "logistics" } });
            optimized = await runWithReplayLog({
                requestId, agentName: "logistics", stepIndex: 2,
                input: { destination: enriched.destination, daysCount: enriched.days.length, hotelsCount: enriched.hotels.length },
                run: () => this.logistics.run(enriched, requestId),
                buildOutputSummary: (r) => ({ selectedHotel: r.selectedHotel.name, daysOptimized: r.days.length }),
            });
            this.logAgent("logistics", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "logistics", selectedHotel: optimized.selectedHotel.name } });
        } catch (err) {
            this.logAgent("logistics", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "logistics", error: (err as Error).message } });
            return { ok: false, stage: "logistics", context: enriched, executionLog: this.executionLog, error: (err as Error).message };
        }

        // Step 4: First budget + safety pass
        let lastSafe = await this.runBudgetAndSafety(optimized, requestId);
        if (!lastSafe) {
            return { ok: false, stage: "budget_safety", context: optimized, executionLog: this.executionLog };
        }

        // ── Validation loop (max MAX_ITERATIONS LLM decisions) ────────────────
        let decisionRound = 0;
        let explicitProceed = false;

        while (hasBudgetIssues(lastSafe) || isTooDense(lastSafe)) {
            if (decisionRound >= MAX_ITERATIONS) break;

            const overBudget = hasBudgetIssues(lastSafe);
            const dense = isTooDense(lastSafe);
            const issue = classifyIssue(overBudget, dense);
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { step: "validation-loop", round: decisionRound + 1, issue, overBudget, dense } });

            let action: OrchestratorAction = "reoptimize_budget";
            try {
                ({ action } = await this.decide({ issue, context: lastSafe }));
            } catch {
                // LLM or injected decider threw — fall back to safe default
                action = "reoptimize_budget";
            }
            this.logLlmDecision(issue, action);
            decisionRound += 1;
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { step: "llm-decision", action, round: decisionRound } });

            if (action === "ask_user") {
                return {
                    requiresHuman: true,
                    message: "Trip needs adjustment. Proceed or optimize?",
                    context: lastSafe,
                    executionLog: this.executionLog,
                };
            }

            if (action === "proceed") {
                explicitProceed = true;
                break;
            }

            if (action === "rerun_logistics" || action === "reoptimize_budget") {
                // reoptimize_budget: hint the logistics agent toward a cheaper hotel tier
                // by injecting the current budget ceiling into the enriched context.
                // rerun_logistics: re-run as-is (density / ordering issue, not cost).
                const logisticsInput: typeof enriched =
                    action === "reoptimize_budget" && lastSafe.preferences?.budget
                        ? { ...enriched, preferences: { ...enriched.preferences, budget: lastSafe.preferences.budget } }
                        : enriched;
                try {
                    optimized = await this.logistics.run(logisticsInput, requestId);
                    this.logAgent("logistics", "success");
                } catch (err) {
                    this.logAgent("logistics", "error", (err as Error).message);
                    logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "logistics", round: decisionRound, error: (err as Error).message } });
                    break;
                }
            }

            const nextSafe = await this.runBudgetAndSafety(optimized, requestId);
            if (nextSafe) lastSafe = nextSafe;
            else break;
        }

        // ── Human-in-the-loop: loop exhausted with unresolved issues ──────────
        if (!explicitProceed && (hasBudgetIssues(lastSafe) || isTooDense(lastSafe))) {
            const stillBudget = hasBudgetIssues(lastSafe);
            const stillDense = isTooDense(lastSafe);
            const message =
                stillBudget && stillDense
                    ? "Trip exceeds budget and the schedule is very packed. Optimize or proceed?"
                    : stillBudget
                      ? "Trip exceeds budget. Optimize or proceed?"
                      : "Trip itinerary is very packed. Proceed or optimize?";
            logStructured({ layer: "orchestrator", step: "end", requestId, data: { outcome: "requires-human", message } });
            return { requiresHuman: true, message, context: lastSafe, executionLog: this.executionLog };
        }

        logStructured({ layer: "orchestrator", step: "end", requestId, data: { outcome: "ok", rounds: decisionRound } });
        return { ok: true, requiresHuman: false, context: lastSafe, executionLog: this.executionLog };
    }
}

// ─── LangGraph bridge ─────────────────────────────────────────────────────────

const LANGGRAPH_URL = env.LANGGRAPH_SERVICE_URL ?? "http://localhost:8000";

/**
 * Run the pipeline via the Python LangGraph service.
 * Falls back transparently to the TS AgentOrchestrator if the service
 * is unreachable or returns a non-OK HTTP status.
 *
 * Usage (progressive adoption):
 *   const result = await runViaLangGraph(input);
 *
 * Fallback behaviour:
 *   If LANGGRAPH_SERVICE_URL is unset (local dev without Python) or the
 *   service is down, the TS orchestrator runs instead — zero user impact.
 */
export async function runViaLangGraph(
    input: string,
    deps?: AgentOrchestratorDeps,
): Promise<OrchestratorResult> {
    const requestId = generateRequestId();
    logStructured({ layer: "orchestrator", step: "start", requestId, data: { source: "langgraph-bridge", inputLength: input.length } });

    try {
        const response = await fetch(`${LANGGRAPH_URL}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input, request_id: requestId }),
            signal: AbortSignal.timeout(180_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`LangGraph service returned HTTP ${response.status}: ${text}`);
        }

        const data: unknown = await response.json();
        const parsed = OrchestratorResultSchema.safeParse(data);
        if (!parsed.success) {
            logError("LangGraph response failed OrchestratorResult validation — falling back to TS orchestrator", {
                requestId,
                zodIssues: parsed.error.issues,
            });
            const orch = new AgentOrchestrator(deps);
            return orch.run(input);
        }

        const result = parsed.data as OrchestratorResult;
        logStructured({ layer: "orchestrator", step: "end", requestId, data: { source: "langgraph-bridge", ok: "ok" in result ? result.ok : undefined } });
        return result;
    } catch (err) {
        logError("LangGraph service unreachable — falling back to TS orchestrator", {
            error: (err as Error).message,
            requestId,
        });
        // Transparent fallback: run the identical TS implementation
        const orch = new AgentOrchestrator(deps);
        return orch.run(input);
    }
}
