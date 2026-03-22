import { PlannerAgent, type TripContext } from "@/agents/planner/plannerAgent";
import { ResearchAgent, type EnrichedTripContext } from "@/agents/research/researchAgent";
import { LogisticsAgent } from "@/agents/logistics/logisticsAgent";
import {
    BudgetAgent,
    type BudgetedTripContext,
    type OptimizedTripContext,
} from "@/agents/budget/budgetAgent";
import { SafetyAgent, type SafeTripContext } from "@/agents/safety/safetyAgent";
import { LLMClientFactory, parseJSONResponse } from "@/lib/ai/llm";
import type { LLMMessage } from "@/lib/ai/types";
import { logStructured, generateRequestId } from "@/infrastructure/logger";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 3;

/**
 * Days with more than this many activities are treated as "too dense".
 * Aligned with SafetyAgent's fatigue threshold (>4 = medium, >5 = high).
 */
const MAX_ACTIVITIES_BEFORE_DENSE = 4;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ORCHESTRATOR_DECISION_PROMPT = `You are an orchestrator.
Given the issue and context, choose ONE action:
- reoptimize_budget
- rerun_logistics
- ask_user
- proceed

Return JSON only:
{ "action": "..." }`;

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
    /** Override for the LLM decision function — useful in tests. */
    decideNextAction?: (input: DecideInput) => Promise<{ action: OrchestratorAction }>;
};

// ─── Internal types ───────────────────────────────────────────────────────────

export type DecideInput = {
    issue: "over_budget" | "too_dense" | "unknown";
    context: unknown;
};

// ─── LLM decision helper ──────────────────────────────────────────────────────

const VALID_ACTIONS = new Set<OrchestratorAction>([
    "reoptimize_budget",
    "rerun_logistics",
    "ask_user",
    "proceed",
]);

async function defaultDecideNextAction(
    input: DecideInput,
): Promise<{ action: OrchestratorAction }> {
    const fallback: { action: OrchestratorAction } = { action: "reoptimize_budget" };

    try {
        const client = LLMClientFactory.create({ agent: "orchestrator" });
        const summary = JSON.stringify({
            issue: input.issue,
            destination: (input.context as { destination?: string })?.destination,
            durationDays: (input.context as { durationDays?: number })?.durationDays,
            isOverBudget: (input.context as { budget?: { isOverBudget?: boolean } })?.budget
                ?.isOverBudget,
            maxActivitiesInDay: maxActivitiesInDay(
                input.context as { days?: Array<{ activities?: unknown[] }> },
            ),
        });

        const messages: LLMMessage[] = [
            { role: "system", content: ORCHESTRATOR_DECISION_PROMPT },
            { role: "user", content: `Issue: ${input.issue}\nContext summary: ${summary}` },
        ];

        const response = await client.execute(messages, {
            temperature: 0,
            responseFormat: "json",
            maxTokens: 128,
            timeoutMs: 15_000,
        });

        const parsed = parseJSONResponse<{ action?: unknown }>(response.content);
        const action = parsed?.action;
        if (typeof action === "string" && VALID_ACTIONS.has(action as OrchestratorAction)) {
            return { action: action as OrchestratorAction };
        }
    } catch {
        // fall through to safe default
    }

    return fallback;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function maxActivitiesInDay(ctx: { days?: Array<{ activities?: unknown[] }> }): number {
    let m = 0;
    for (const d of ctx.days ?? []) {
        const n = d.activities?.length ?? 0;
        if (n > m) m = n;
    }
    return m;
}

function isTooDense(ctx: { days?: Array<{ activities?: unknown[] }> }): boolean {
    return (ctx.days ?? []).some((d) => (d.activities?.length ?? 0) > MAX_ACTIVITIES_BEFORE_DENSE);
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

    private async runBudgetAndSafety(
        opt: OptimizedTripContext,
        requestId?: string,
    ): Promise<SafeTripContext | undefined> {
        let budgeted: BudgetedTripContext | undefined;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "budget" } });
            budgeted = await this.budget.run(opt, requestId);
            this.logAgent("budget", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "budget", totalCost: budgeted.budget.totalEstimatedCost, isOverBudget: budgeted.budget.isOverBudget } });
        } catch (err) {
            this.logAgent("budget", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "budget", error: (err as Error).message } });
            return undefined;
        }

        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "safety" } });
            const safe = await this.safety.run(budgeted, requestId);
            this.logAgent("safety", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "safety", riskLevel: safe.safety.riskLevel } });
            return safe;
        } catch (err) {
            this.logAgent("safety", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "safety", error: (err as Error).message } });
            // Fallback: pipeline continues; safety result is empty but logged as failed.
            return { ...budgeted, safety: { riskLevel: "low" as const, warnings: [], tips: [] } } as SafeTripContext;
        }
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async run(input: string): Promise<OrchestratorResult> {
        this.executionLog.length = 0;
        const requestId = generateRequestId();
        logStructured({ layer: "orchestrator", step: "start", requestId, data: { inputLength: input.length } });

        // Step 1: Planner
        let trip: TripContext;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "planner" } });
            trip = await this.planner.run(input, requestId);
            this.logAgent("planner", "success");
            logStructured({ layer: "orchestrator", step: "output", requestId, data: { agent: "planner", destination: trip.destination, durationDays: trip.durationDays } });
        } catch (err) {
            this.logAgent("planner", "error", (err as Error).message);
            logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "planner", error: (err as Error).message } });
            return { ok: false, stage: "planner", executionLog: this.executionLog, error: (err as Error).message };
        }

        // Step 2: Research — store enriched for logistics re-runs inside the loop
        let enriched: EnrichedTripContext;
        try {
            logStructured({ layer: "orchestrator", step: "input", requestId, data: { calling: "research", destination: trip.destination } });
            enriched = await this.research.run(trip, requestId);
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
            optimized = await this.logistics.run(enriched, requestId);
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

            if (action === "rerun_logistics") {
                try {
                    optimized = await this.logistics.run(enriched, requestId);
                    this.logAgent("logistics", "success");
                } catch (err) {
                    this.logAgent("logistics", "error", (err as Error).message);
                    logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "logistics", round: decisionRound, error: (err as Error).message } });
                }
            } else if (action === "reoptimize_budget") {
                // BudgetAgent only calculates costs; to actually reduce them, re-run
                // logistics so it can select a cheaper hotel / activity set.
                try {
                    optimized = await this.logistics.run(enriched, requestId);
                    this.logAgent("logistics", "success");
                } catch (err) {
                    this.logAgent("logistics", "error", (err as Error).message);
                    logStructured({ layer: "orchestrator", step: "error", requestId, data: { agent: "logistics", round: decisionRound, error: (err as Error).message } });
                }
            }

            const nextSafe = await this.runBudgetAndSafety(optimized, requestId);
            if (nextSafe) lastSafe = nextSafe;
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
