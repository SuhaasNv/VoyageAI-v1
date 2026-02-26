/**
 * Per-call LLM usage tracking.
 * Logs tokens, latency, model, cost estimate — DB or console.
 * Engineering credibility: recruiters love cost-awareness.
 */

import type { LLMResponse } from "./llm";

// $ per 1M tokens (input, output). Approximate; update as pricing changes.
const COST_PER_1M: Record<string, { input: number; output: number }> = {
    "llama-3.1-8b-instant": { input: 0.05, output: 0.05 },
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "llama-3.1-70b-versatile": { input: 0.59, output: 0.79 },
    "llama-3.1-405b-reasoning": { input: 3.0, output: 15.0 },
    "gemini-1.5-flash": { input: 0.075, output: 0.30 },
    "gemini-1.5-pro": { input: 1.25, output: 5.0 },
    "gpt-4o": { input: 2.5, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "voyage-ai-mock-v1.0": { input: 0, output: 0 },
    mock: { input: 0, output: 0 },
};

function estimateCostUsd(response: LLMResponse): number {
    const key =
        Object.keys(COST_PER_1M).find((k) =>
            response.modelUsed.toLowerCase().includes(k)
        ) ?? (response.provider === "mock" ? "mock" : null);
    const rates = key ? COST_PER_1M[key] : { input: 0.1, output: 0.3 };
    const inputCost = (response.promptTokens / 1_000_000) * rates.input;
    const outputCost = (response.completionTokens / 1_000_000) * rates.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export interface UsageLogMetadata {
    requestId?: string | null;
    endpoint?: string;
}

export async function logLLMUsage(
    response: LLMResponse,
    metadata?: UsageLogMetadata
): Promise<void> {
    const costUsd = estimateCostUsd(response);
    const payload = {
        provider: response.provider,
        model: response.modelUsed,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        latencyMs: response.latencyMs,
        costUsd,
        requestId: metadata?.requestId ?? null,
        endpoint: metadata?.endpoint ?? null,
    };

    try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.aiUsageLog.create({
            data: {
                provider: payload.provider,
                modelUsed: payload.model,
                promptTokens: payload.promptTokens,
                completionTokens: payload.completionTokens,
                totalTokens: payload.totalTokens,
                latencyMs: payload.latencyMs,
                costEstimateUsd: payload.costUsd,
                requestId: payload.requestId ?? undefined,
                endpoint: payload.endpoint ?? undefined,
            },
        });
    } catch {
        console.log(
            "[LLM Usage]",
            JSON.stringify({
                ...payload,
                timestamp: new Date().toISOString(),
            })
        );
    }
}
