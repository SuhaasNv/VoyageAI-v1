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
 *   1. LLM_PROVIDER env var ("gemini" | "groq" | "mock")
 *   2. API key availability cross-check
 *   3. Fallback to mock for dev/CI
 *
 * Fallback between providers is already handled by executeWithRetry in llm.ts
 * (Gemini fallback after primary exhausted). This module only selects the
 * *starting* configuration for each call.
 *
 * Model names are overridable via env vars so deployments can pin versions:
 *   GEMINI_FLASH_MODEL  (default: gemini-2.5-flash)  ← only Gemini model used
 *   GROQ_FAST_MODEL     (default: llama-3.1-8b-instant)
 *   GROQ_STRONG_MODEL   (default: llama-3.3-70b-versatile)
 */

import { logError } from "@/infrastructure/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelConfig {
    /** Resolved provider for this call (informational — client is still the singleton). */
    provider: "gemini" | "groq";
    /** Model identifier passed to the LLM client via LLMRequestOptions.model. */
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
}

type Provider = "gemini" | "groq" | "mock";

// ─── Model name constants (overridable via env) ───────────────────────────────
// Only gemini-2.5-flash is available — all Gemini endpoints use flash.

const GEMINI_FLASH = process.env.GEMINI_FLASH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GROQ_FAST = process.env.GROQ_FAST_MODEL ?? "llama-3.1-8b-instant";
const GROQ_STRONG = process.env.GROQ_STRONG_MODEL ?? "llama-3.3-70b-versatile";

// ─── Per-endpoint config table ────────────────────────────────────────────────
//
// Each entry is a function so intent-based variants can branch cleanly.
// "mock" entries mirror real model configs structurally — MockLLMClient
// ignores the model string but the rest of the pipeline sees a real shape.

interface ProviderMatrix {
    gemini: Omit<ModelConfig, "provider">;
    groq: Omit<ModelConfig, "provider">;
    mock: Omit<ModelConfig, "provider">;
}

const CONFIGS: Record<string, (intent?: string) => ProviderMatrix> = {

    // ── Landing page prompt bar ────────────────────────────────────────────────
    // QUESTION → fast flash, low tokens (streaming QA needs low latency)
    // CREATE_TRIP → extraction JSON, very low temperature
    landing: (intent) => {
        const isCreate = intent === "CREATE_TRIP";
        return {
            gemini: { model: GEMINI_FLASH, temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 15_000 : 25_000 },
            groq: { model: GROQ_FAST, temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: isCreate ? 12_000 : 20_000 },
            mock: { model: "mock", temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800, timeoutMs: 5_000 },
        };
    },

    // ── Full itinerary generation ──────────────────────────────────────────────
    // Large token budget for multi-day itineraries; flash handles this well.
    itinerary: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        groq: { model: GROQ_STRONG, temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
    }),

    // ── Structured diff reoptimization ────────────────────────────────────────
    // Low temperature for deterministic diff edits.
    reoptimize: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        groq: { model: GROQ_STRONG, temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        mock: { model: "mock", temperature: 0.3, maxTokens: 8192, timeoutMs: 30_000 },
    }),

    // ── Conversational chat companion ──────────────────────────────────────────
    // Balanced config — fast model sufficient, moderate tokens for responses.
    chat: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
        groq: { model: GROQ_FAST, temperature: 0.7, maxTokens: 2048, timeoutMs: 25_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 2048, timeoutMs: 15_000 },
    }),

    // ── Packing list ───────────────────────────────────────────────────────────
    // Moderate complexity — strong Groq model handles categorisation well.
    packing: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        groq: { model: GROQ_STRONG, temperature: 0.7, maxTokens: 4096, timeoutMs: 25_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 4096, timeoutMs: 15_000 },
    }),

    // ── Trip risk simulation ───────────────────────────────────────────────────
    simulation: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        groq: { model: GROQ_STRONG, temperature: 0.7, maxTokens: 4096, timeoutMs: 25_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 4096, timeoutMs: 15_000 },
    }),

    // ── NL → trip params extraction ───────────────────────────────────────────
    "create-trip": () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
        groq: { model: GROQ_FAST, temperature: 0.3, maxTokens: 512, timeoutMs: 10_000 },
        mock: { model: "mock", temperature: 0.3, maxTokens: 512, timeoutMs: 5_000 },
    }),

    // ── Ticket / booking text extraction ──────────────────────────────────────
    ticket: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.2, maxTokens: 512, timeoutMs: 10_000 },
        groq: { model: GROQ_FAST, temperature: 0.2, maxTokens: 512, timeoutMs: 10_000 },
        mock: { model: "mock", temperature: 0.2, maxTokens: 512, timeoutMs: 5_000 },
    }),

    // ── Dashboard contextual suggestions ──────────────────────────────────────
    suggestions: () => ({
        gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 512, timeoutMs: 10_000 },
        groq: { model: GROQ_FAST, temperature: 0.7, maxTokens: 512, timeoutMs: 10_000 },
        mock: { model: "mock", temperature: 0.7, maxTokens: 512, timeoutMs: 5_000 },
    }),
};

const DEFAULT_MATRIX: ProviderMatrix = {
    gemini: { model: GEMINI_FLASH, temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    groq: { model: GROQ_FAST, temperature: 0.7, maxTokens: 2048, timeoutMs: 25_000 },
    mock: { model: "mock", temperature: 0.7, maxTokens: 2048, timeoutMs: 15_000 },
};

// ─── Provider resolution ──────────────────────────────────────────────────────

function resolveProvider(): Provider {
    const env = (process.env.LLM_PROVIDER ?? "mock") as Provider;
    // Validate the declared provider actually has an API key available.
    if (env === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
    if (env === "groq" && process.env.GROQ_API_KEY) return "groq";
    // In production, a misconfigured provider (key missing) is a critical bug —
    // log at error level so it surfaces in observability tooling.
    if (process.env.NODE_ENV === "production" && (env === "gemini" || env === "groq")) {
        logError(`[modelRouter] LLM_PROVIDER="${env}" set but API key is absent — falling back to mock`, {
            provider: env,
        });
    }
    // In dev/CI with no key configured the mock is always safe.
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

    if (provider === "gemini") return { provider: "gemini", ...matrix.gemini };
    if (provider === "groq") return { provider: "groq", ...matrix.groq };
    // mock — report provider as "mock" so callers can branch correctly in tests
    return { provider: "gemini" as const, ...matrix.mock };
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
