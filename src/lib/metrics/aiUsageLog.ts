/**
 * Single source of truth for “failed LLM call” semantics in ai_usage_logs.
 *
 * - New rows: callSucceeded is set explicitly (true on completion, false on logged failure).
 * - Legacy rows (callSucceeded = null): treat totalTokens === 0 as failure for metrics only.
 */

import type { Prisma } from "@prisma/client";

/** Prisma filter: rows that count as failures for error-rate and health metrics. */
export const whereAiCallFailed: Prisma.AiUsageLogWhereInput = {
    OR: [
        { callSucceeded: false },
        { AND: [{ callSucceeded: null }, { totalTokens: 0 }] },
    ],
};

/** Combine with a time window (e.g. last 5 minutes). */
export function whereAiCallFailedSince(since: Date): Prisma.AiUsageLogWhereInput {
    return {
        AND: [{ createdAt: { gte: since } }, whereAiCallFailed],
    };
}

/** For in-memory aggregation over selected log rows (predictive, optimization, etc.). */
export function isAiUsageLogFailure(row: {
    callSucceeded: boolean | null;
    totalTokens: number;
}): boolean {
    if (row.callSucceeded === false) return true;
    if (row.callSucceeded === true) return false;
    return row.totalTokens === 0;
}
