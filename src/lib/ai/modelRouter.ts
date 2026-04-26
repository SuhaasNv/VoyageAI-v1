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
import { CONFIGS, DEFAULT_MATRIX } from "./modelRouterConfigs";

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
