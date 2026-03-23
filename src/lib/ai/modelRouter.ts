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
 *   PRIMARY  → OpenAI  (LLM_PROVIDER=openai, OPENAI_API_KEY set)
 *   FALLBACK → Gemini  (GEMINI_API_KEY set — automatic via executeWithRetry)
 *   DEV/CI   → Mock    (no keys configured)
 *
 * Model name is overridable via env var:
 *   GEMINI_FLASH_MODEL  (default: gemini-2.5-flash)
 */

import { logError } from "@/infrastructure/logger";
import { applyHealingOverrides } from "@/services/ai/healingStore";

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

type Provider = "gemini" | "openai" | "mock";

// ─── Model name constants (overridable via env) ───────────────────────────────

const GEMINI_FLASH = process.env.GEMINI_FLASH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ─── Per-endpoint config table ────────────────────────────────────────────────
//
// Each entry is a function so intent-based variants can branch cleanly.
// "mock" entries mirror real model configs structurally — MockLLMClient
// ignores the model string but the rest of the pipeline sees a real shape.

interface ProviderMatrix {
    openai: Omit<ModelConfig, "provider">;
    gemini: Omit<ModelConfig, "provider">;
    mock: Omit<ModelConfig, "provider">;
}

const CONFIGS: Record<string, (intent?: string) => ProviderMatrix> = {

    // ── Landing page prompt bar ────────────────────────────────────────────────
    landing: (intent) => {
        const isCreate = intent === "CREATE_TRIP";
        return {
            openai: { model: isCreate ? "gpt-4.1-mini" : "gpt-4.1-mini", temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 15_000 : 25_000 },
            gemini: { model: GEMINI_FLASH, temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 15_000 : 25_000 },
            mock: { model: "mock", temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: 5_000 },
        };
    },

    // ── Full itinerary generation ──────────────────────────────────────────────
    itinerary: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
    }),

    // ── Structured diff reoptimization ────────────────────────────────────────
    reoptimize: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        mock: { model: "mock", temperature: 0.3, maxTokens: 8192, timeoutMs: 30_000 },
    }),

    // ── Conversational chat companion ──────────────────────────────────────────
    chat: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 2048, timeoutMs: 15_000 },
    }),

    // ── Packing list ───────────────────────────────────────────────────────────
    packing: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 4096, timeoutMs: 15_000 },
    }),

    // ── Trip risk simulation ───────────────────────────────────────────────────
    simulation: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 4096, timeoutMs: 15_000 },
    }),

    // ── NL → trip params extraction ───────────────────────────────────────────
    "create-trip": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
        mock: { model: "mock", temperature: 0.3, maxTokens: 512, timeoutMs: 5_000 },
    }),

    // ── Ticket / booking text extraction ──────────────────────────────────────
    ticket: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.2, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.2, maxTokens: 512, timeoutMs: 10_000 },
        mock: { model: "mock", temperature: 0.2, maxTokens: 512, timeoutMs: 5_000 },
    }),

    // ── Budget constraint suggestions ─────────────────────────────────────────
    budget: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
        mock: { model: "mock", temperature: 0.3, maxTokens: 400, timeoutMs: 5_000 },
    }),

    // ── Dashboard contextual suggestions ──────────────────────────────────────
    suggestions: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 512, timeoutMs: 10_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 512, timeoutMs: 5_000 },
    }),

    // ── Research Agent — attraction/hotel/restaurant enrichment ───────────────
    research: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH, temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
        mock:   { model: "mock",        temperature: 0.5, maxTokens: 4096, timeoutMs: 15_000 },
    }),
};

const DEFAULT_MATRIX: ProviderMatrix = {
    openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    mock: { model: "mock", temperature: 0.7, maxTokens: 2048, timeoutMs: 15_000 },
};

// ─── Provider resolution ──────────────────────────────────────────────────────

function resolveProvider(): Provider {
    const env = (process.env.LLM_PROVIDER ?? "mock") as Provider;
    if (env === "openai" && process.env.OPENAI_API_KEY) return "openai";
    if (env === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
    // In production, a misconfigured provider (key missing) is a critical bug.
    if (process.env.NODE_ENV === "production" && (env === "openai" || env === "gemini")) {
        logError(`[modelRouter] LLM_PROVIDER="${env}" set but API key is absent — falling back to mock`, {
            provider: env,
        });
    }
    return "mock";
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
        provider === "openai" ? { provider: "openai" as const, ...matrix.openai } :
        provider === "gemini" ? { provider: "gemini" as const, ...matrix.gemini } :
        // mock — report provider as "openai" so callers see a real-shaped config in tests
        { provider: "openai" as const, ...matrix.mock };

    // Apply any active auto-healing overrides (token reduction, provider switch, timeout reduction)
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
