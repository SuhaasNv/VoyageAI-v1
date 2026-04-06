/**
 * Builds UI trace rows for the itinerary flow from FlowState.
 * (Previously lived alongside an unused AgentTracePanel component.)
 */

import type { FlowState, FlowStage } from "./types";

export type TraceStatus = "pending" | "running" | "done" | "error";

export interface FlowTraceEntry {
    id: string;
    stage: FlowStage;
    label: string;
    status: TraceStatus;
    durationMs?: number;
    detail?: string;
    timestamp: number;
}

const STAGE_META: Record<Exclude<FlowStage, "saved">, { label: string; description: string }> = {
    planner:   { label: "Blueprint", description: "Parsing destination, dates & style" },
    research:  { label: "Research",  description: "Fetching attractions, hotels & dining" },
    logistics: { label: "Logistics", description: "Optimizing route & time slots" },
    budget:    { label: "Budget",    description: "Calculating costs & savings" },
    safety:    { label: "Safety",    description: "Risk assessment & travel tips" },
};

const STAGE_ORDER: Exclude<FlowStage, "saved">[] = [
    "planner", "research", "logistics", "budget", "safety",
];

export function buildTraceEntries(state: FlowState): FlowTraceEntry[] {
    const isSaved = state.stage === "saved";
    const currentIdx = isSaved
        ? STAGE_ORDER.length
        : STAGE_ORDER.indexOf(state.stage as Exclude<FlowStage, "saved">);

    return STAGE_ORDER.map((stage, idx) => {
        const meta = STAGE_META[stage];
        const stageResult =
            stage === "planner"   ? state.plannerResult :
            stage === "research"  ? state.researchResult :
            stage === "logistics" ? state.logisticsResult :
            stage === "budget"    ? state.budgetResult :
                                    state.safetyResult;

        const stageMeta = state.meta[stage];

        let status: TraceStatus = "pending";
        if (idx < currentIdx) {
            status = stageResult ? "done" : "error";
        } else if (idx === currentIdx) {
            status = state.isLoading ? "running" : (stageResult ? "done" : "pending");
        }

        if (state.error && idx < currentIdx) status = "done";

        return {
            id: `${stage}-${state.iteration}`,
            stage,
            label: meta.label,
            status,
            durationMs: stageMeta?.durationMs,
            detail: status === "running"
                ? meta.description
                : status === "done" && stageMeta?.decisionsLog?.length
                    ? stageMeta.decisionsLog[stageMeta.decisionsLog.length - 1]?.replace(/^\+\d+ms\s*/, "")
                    : undefined,
            timestamp: Date.now() - idx * 10,
        };
    });
}
