/**
 * Intelligent Model Router
 *
 * selectModelConfig({ endpoint, intent? }) → ModelConfig
 *
 * Returns the optimal { provider, model, temperature, maxTokens, timeoutMs }
 * tuple for a given endpoint. Callers spread this directly into their
 * LLMRequestOptions, preserving all existing retry / schema-validation /
 * safety-layer logic unchanged.
 *
 * Provider precedence (runtime):
 *   Resolved via resolveRealLlmProvider() — OpenAI and/or Gemini from env + API keys.
 *   Cross-provider retry/fallback is handled in executeWithRetry (llm.ts).
 *
 * Model name is overridable via env var:
 *   GEMINI_FLASH_MODEL  (default: gemini-2.5-flash)
 */

import { logError } from "@/infrastructure/logger";
import { applyHealingOverrides } from "@/services/ai/healingStore";
import { resolveRealLlmProvider } from "./resolveRealLlmProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelConfig {
    /** Resolved provider for this call (informational — client is still the singleton). */
    provider: "gemini" | "openai";
    /** Model identifier passed to the LLM client via LLMRequestOptions.model. */
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
}

type RealProvider = "gemini" | "openai";

// ─── Model name constants (overridable via env) ───────────────────────────────

const GEMINI_FLASH = process.env.GEMINI_FLASH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ─── Per-endpoint config table ────────────────────────────────────────────────

interface ProviderMatrix {
    openai: Omit<ModelConfig, "provider">;
    gemini: Omit<ModelConfig, "provider">;
}

const CONFIGS: Record<string, (intent?: string) => ProviderMatrix> = {

    // ── Landing page prompt bar ────────────────────────────────────────────────
    landing: (intent) => {
        const isCreate = intent === "CREATE_TRIP";
        return {
            openai: { model: isCreate ? "gpt-4.1-mini" : "gpt-4.1-mini", temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 15_000 : 25_000 },
            gemini: { model: GEMINI_FLASH, temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 15_000 : 25_000 },
        };
    },

    // ── Landing preview — lightweight single-call markdown (replaces full pipeline for teaser) ──
    "landing-preview": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 1200, timeoutMs: 20_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 1200, timeoutMs: 20_000 },
    }),

    // ── Full itinerary generation ──────────────────────────────────────────────
    itinerary: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
    }),

    // ── Structured diff reoptimization ────────────────────────────────────────
    reoptimize: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
    }),

    // ── Conversational chat companion ──────────────────────────────────────────
    chat: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    }),

    // ── Packing list ───────────────────────────────────────────────────────────
    packing: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
    }),

    // ── Trip risk simulation ───────────────────────────────────────────────────
    simulation: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
    }),

    // ── NL → trip params extraction ───────────────────────────────────────────
    "create-trip": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
    }),

    // ── Ticket / booking text extraction ──────────────────────────────────────
    ticket: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.2, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.2, maxTokens: 512, timeoutMs: 10_000 },
    }),

    // ── Budget constraint suggestions ─────────────────────────────────────────
    budget: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
    }),

    // ── Dashboard contextual suggestions ──────────────────────────────────────
    suggestions: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 512, timeoutMs: 10_000 },
    }),

    // ── Research Agent — attraction/hotel/restaurant enrichment ───────────────
    research: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
    }),
};

const DEFAULT_MATRIX: ProviderMatrix = {
    openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
};

// ─── Provider resolution ──────────────────────────────────────────────────────

function resolveProvider(): RealProvider {
    try {
        return resolveRealLlmProvider();
    } catch (e) {
        logError("[modelRouter] LLM resolution failed; using OpenAI-shaped defaults until API keys are configured.", {
            message: (e as Error).message,
        });
        return "openai";
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the optimal model configuration for `endpoint`.
 *
 * Usage in a service:
 *
 *   const modelConfig = selectModelConfig({ endpoint: "itinerary" });
 *   const llmOptions  = { ...modelConfig, responseFormat: "json" as const, retries: 2 };
 */
export function selectModelConfig({
    endpoint,
    intent,
}: {
    endpoint: string;
    intent?: string;
}): ModelConfig {
    const provider = resolveProvider();
    const matrix = (CONFIGS[endpoint]?.(intent)) ?? DEFAULT_MATRIX;

    const base =
        provider === "gemini"
            ? { provider: "gemini" as const, ...matrix.gemini }
            : { provider: "openai" as const, ...matrix.openai };

    return applyHealingOverrides(base);
}

/**
 * Convenience accessor for the Gemini streaming path in the landing route
 * (which calls the SDK directly and needs just a model string + generation
 * config rather than the full LLMRequestOptions spread).
 */
export function selectGeminiStreamConfig(
    endpoint: string,
    intent?: string,
): { model: string; temperature: number; maxOutputTokens: number } {
    const matrix = (CONFIGS[endpoint]?.(intent)) ?? DEFAULT_MATRIX;
    return {
        model: matrix.gemini.model,
        temperature: matrix.gemini.temperature,
        maxOutputTokens: matrix.gemini.maxTokens,
    };
}
