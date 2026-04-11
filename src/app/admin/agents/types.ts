/** Shared types for the admin/agents route — imported by both page.tsx and _trace.tsx. */

export interface PipelineRun {
    requestId:       string;
    startedAt:       string;
    totalDurationMs: number;
    totalTokens:     number;
    totalCostUsd:    number;
    stepCount:       number;
    hasError:        boolean;
    failedAgent:     string | null;
    /** true = has AgentExecutionLog rows (structured); false = legacy AiUsageLog only */
    hasStructuredLogs: boolean;
}
