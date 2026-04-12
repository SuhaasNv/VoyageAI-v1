/**
 * itinerary-flow/types.ts
 *
 * Shared TypeScript contracts for the full agent pipeline UI.
 * All stage components, the state machine, and the orchestrator
 * derive their shapes from here.
 */

import type { TripContext } from "@/agents/planner/plannerAgent";
import type { EnrichedTripContext } from "@/agents/research/researchAgent";
import type { OptimizedTripContext } from "@/agents/logistics/logisticsAgent";
import type { BudgetedTripContext } from "@/agents/budget/budgetAgent";
import type { SafeTripContext } from "@/agents/safety/safetyAgent";

// ─── Flow stages ─────────────────────────────────────────────────────────────

export type FlowStage = "planner" | "research" | "logistics" | "budget" | "safety" | "saved";

// ─── Input from CreateTripModal ───────────────────────────────────────────────

export interface FlowInput {
    tripId: string;
    destination: string;
    startDate: string;
    endDate: string;
    style?: string;
    imageUrl?: string | null;
}

// ─── Per-stage metadata (drives explainability) ───────────────────────────────

export interface FlowMetadata {
    /** Wall-clock duration the API call took (ms). */
    durationMs: number;
    /** 0–1 confidence estimate from the agent layer. */
    confidence: number;
    /** Human-readable list of data sources used by this agent. */
    dataSources: string[];
    /** Chronological log lines with optional "+Xs" time offsets. */
    decisionsLog: string[];
}

// ─── Full flow state (held in useFlowState) ───────────────────────────────────

export interface FlowState {
    stage: FlowStage;
    /** True while a stage API call is in-flight. */
    isLoading: boolean;
    input: FlowInput;
    plannerResult: TripContext | null;
    researchResult: EnrichedTripContext | null;
    logisticsResult: OptimizedTripContext | null;
    budgetResult: BudgetedTripContext | null;
    safetyResult: SafeTripContext | null;
    meta: Partial<Record<FlowStage, FlowMetadata>>;
    /** Increments every time resetAllAndRestart() is called. */
    iteration: number;
    /** Stable ID for the current planning session (used for localStorage keying). */
    sessionId: string;
    error: string | null;
}

// ─── StageProps contract ──────────────────────────────────────────────────────
//
// Every stage component must implement this interface.
// Adding a 6th agent = implement StageProps + add to AGENT_REGISTRY.

export interface StageProps<TResult> {
    input: FlowInput;
    result: TResult | null;
    meta: FlowMetadata | null;
    isLoading: boolean;
    error: string | null;
    onApprove: (result: TResult) => void;
    onAdjust: (feedback?: string) => void;
    onExplain: () => void;
    onRetry: () => void;
}

// ─── Apply-plan change record ─────────────────────────────────────────────────

/**
 * A single human-readable record of what the plan changed.
 * Derived from plan.appliedAdjustments before the API call; passed down to
 * BudgetStage so the UI can surface exactly what changed.
 */
export interface ApplyChange {
    type: "activity_removed" | "hotel_downgraded";
    /** Human-readable detail — e.g. "Tokyo Disneyland · Day 3" or "$$$ → $$" */
    description: string;
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export type {
    TripContext,
    EnrichedTripContext,
    OptimizedTripContext,
    BudgetedTripContext,
    SafeTripContext,
};
