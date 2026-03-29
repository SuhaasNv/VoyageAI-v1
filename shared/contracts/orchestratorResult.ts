/**
 * shared/contracts/orchestratorResult.ts
 *
 * TypeScript Zod schema and inferred type derived from
 * OrchestratorResult.schema.json.
 *
 * Import this instead of duplicating field definitions. Both the
 * AgentOrchestrator (TS) and the runViaLangGraph bridge use this as the
 * single authoritative type for the pipeline result.
 *
 * When the JSON Schema changes, update this file in the same commit.
 */

import { z } from "zod";

// ─── Execution log entry ──────────────────────────────────────────────────────

export const AgentLogEntrySchema = z.object({
    agent:     z.string(),
    status:    z.enum(["success", "error"]),
    timestamp: z.number(),
    detail:    z.string().optional(),
});

export const DecisionLogEntrySchema = z.object({
    type:      z.literal("llm-decision"),
    issue:     z.string(),
    action:    z.string(),
    timestamp: z.number(),
});

export const ExecutionLogEntrySchema = z.discriminatedUnion("type", [
    DecisionLogEntrySchema,
    // AgentLogEntry doesn't have a "type" field — use union instead for the
    // full log array; discriminatedUnion only covers the decision branch.
]).or(AgentLogEntrySchema);

// ─── Execution trace (LangGraph-only, optional) ───────────────────────────────

export const TraceEntrySchema = z.object({
    node:       z.string(),
    durationMs: z.number(),
    iteration:  z.number(),
    inputSnap:  z.record(z.string(), z.unknown()).optional(),
    outputSnap: z.record(z.string(), z.unknown()).optional(),
    skipped:    z.boolean().optional(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

// ─── Metrics (LangGraph-only, optional) ──────────────────────────────────────

export const MetricsSchema = z.object({
    latencyMs:     z.number(),
    iterations:    z.number(),
    agentCalls:    z.number(),
    requiresHuman: z.boolean(),
});

export type Metrics = z.infer<typeof MetricsSchema>;

// ─── Pipeline stages ──────────────────────────────────────────────────────────

export const PipelineStageSchema = z.enum([
    "planner",
    "research",
    "logistics",
    "budget_safety",
]);

export type PipelineStage = z.infer<typeof PipelineStageSchema>;

// ─── OrchestratorResult ───────────────────────────────────────────────────────

export const OrchestratorResultSchema = z.object({
    ok:             z.boolean().nullable().optional(),
    requiresHuman:  z.boolean().nullable().optional(),
    stage:          PipelineStageSchema.nullable().optional(),
    message:        z.string().nullable().optional(),
    context:        z.record(z.string(), z.unknown()).nullable().optional(),
    executionLog:   z.array(z.record(z.string(), z.unknown())).default([]),
    error:          z.string().nullable().optional(),
    // LangGraph-only additions — absent from TS orchestrator results
    executionTrace: z.array(TraceEntrySchema).optional(),
    metrics:        MetricsSchema.nullable().optional(),
});

export type OrchestratorResultContract = z.infer<typeof OrchestratorResultSchema>;
