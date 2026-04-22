/**
 * AI Orchestration Layer — OpenAI + Google Gemini
 *
 * - Primary provider from env (LLM_PROVIDER) with key-based fallback when the preferred key is missing
 * - OpenAI: gpt-4.1 / gpt-4.1-mini (per-agent model routing when the base client is OpenAI)
 * - Automatic OpenAI ↔ Gemini fallback on retries when both keys are set
 *
 * Configure: OPENAI_API_KEY and/or GEMINI_API_KEY; optional LLM_PROVIDER=openai|gemini
 */

import { AIErrorSchema, type AIError } from "./schemas";
import { resolveRealLlmProvider } from "./resolveRealLlmProvider";
import { logLLMCallFailure, logLLMUsage } from "../../services/logging/usageLogger";
import { getRequestId, getRequestPathname } from "@/lib/requestContext";
import { logInfo, logError, logStructured } from "@/infrastructure/logger";
import { recordLLMCall, aiActiveRequests, aiTimeoutsTotal } from "@/lib/monitoring/llmMetrics";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { type LLMMessage, type LLMRequestOptions, type LLMResponse, type LLMClient } from "./types";

// ─────────────────────────────────────────
//  Custom AI Error
// ─────────────────────────────────────────

export class AIServiceError extends Error {
    constructor(
        public readonly code: AIError["code"],
        message: string,
        public readonly details?: unknown,
        public readonly retryAfter?: number
    ) {
        super(message);
        this.name = "AIServiceError";
    }

    toJSON(): AIError {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
            retryAfter: this.retryAfter,
        };
    }
}

// ─────────────────────────────────────────
//  Gemini Client Stub (Real Integration Ready)
// ─────────────────────────────────────────

class GeminiLLMClient implements LLMClient {
    private readonly genAI: GoogleGenerativeAI;
    private readonly defaultModel = "gemini-2.5-flash";

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async execute(
        messages: LLMMessage[],
        options: LLMRequestOptions = {}
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        const modelName = options.model ?? process.env.GEMINI_MODEL ?? this.defaultModel;

        try {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options.temperature ?? 0.7,
                    maxOutputTokens: options.maxTokens ?? 4096,
                    // Only set responseMimeType when JSON is requested; omitting it
                    // avoids errors on models that don't support the field.
                    ...(options.responseFormat === "json" && {
                        responseMimeType: "application/json",
                    }),
                },
            });

            const systemInstruction = messages.find((m) => m.role === "system")?.content;
            const userContent = messages
                .filter((m) => m.role !== "system")
                .map((m) => m.content)
                .join("\n\n");
            const prompt = systemInstruction
                ? `System: ${systemInstruction}\n\nUser: ${userContent}`
                : userContent;

            // No Promise.race timeout — let the SDK surface its own network/deadline
            // errors rather than racing against a hard timer that kills valid responses.
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            if (!text?.trim()) {
                throw new AIServiceError("LLM_ERROR", "Gemini returned an empty response");
            }

            return {
                content: text,
                modelUsed: modelName,
                promptTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
                completionTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
                totalTokens: result.response.usageMetadata?.totalTokenCount ?? 0,
                latencyMs: Date.now() - startTime,
                provider: "gemini",
            };
        } catch (err) {
            // Preserve already-classified errors (e.g. empty-response above).
            if (err instanceof AIServiceError) throw err;

            const msg = (err as Error).message ?? "";

            // Detect rate-limit (429) from Gemini's error message.
            if (
                msg.includes("429") ||
                /quota|rate.?limit/i.test(msg)
            ) {
                throw new AIServiceError(
                    "RATE_LIMIT_EXCEEDED",
                    `Gemini rate limit exceeded: ${msg}`,
                    err
                );
            }

            // Detect auth failures (401/403 / bad API key).
            if (
                msg.includes("403") ||
                msg.includes("401") ||
                /api.?key|unauthorized|permission/i.test(msg)
            ) {
                throw new AIServiceError(
                    "LLM_ERROR",
                    `Gemini authentication error: ${msg}`,
                    err
                );
            }

            throw new AIServiceError(
                "LLM_ERROR",
                `Gemini request failed: ${msg}`,
                err
            );
        }
    }
}

// ─────────────────────────────────────────
//  OpenAI Client (GPT-4.1 and compatible models)
// ─────────────────────────────────────────

import {
    OpenAIClient as _OpenAIClient,
    OpenAIRequestError,
} from "@/infrastructure/llm/openaiClient";

/** Wraps OpenAIClient so it satisfies LLMClient.execute() used throughout the codebase. */
class OpenAILLMClient implements LLMClient {
    readonly inner: _OpenAIClient;

    constructor(apiKey: string, defaultModel?: string) {
        this.inner = new _OpenAIClient(apiKey, defaultModel ?? "gpt-4.1");
    }

    async execute(
        messages: LLMMessage[],
        options: LLMRequestOptions = {}
    ): Promise<LLMResponse> {
        try {
            const result = await this.inner.chat({
                messages,
                model: options.model,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                json: options.responseFormat === "json",
                timeoutMs: options.timeoutMs,
            });
            return {
                content: result.content,
                modelUsed: result.modelUsed,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                totalTokens: result.totalTokens,
                latencyMs: result.latencyMs,
                provider: "openai",
            };
        } catch (err) {
            if (err instanceof OpenAIRequestError) {
                throw new AIServiceError(err.code, err.message, err.details);
            }
            throw new AIServiceError("LLM_ERROR", `OpenAI request failed: ${(err as Error).message}`, err);
        }
    }
}

// ─────────────────────────────────────────
//  LLM Client Factory
// ─────────────────────────────────────────

export type LLMProvider = "gemini" | "openai";

// ── Per-agent model routing ───────────────────────────────────────────────────

/**
 * Supported agent roles.  Determines which OpenAI model is injected as the
 * default when LLM_PROVIDER=openai.  "default" is used by getLLMClient() and
 * any callsite that does not have a named role.
 */
export type AgentRole =
    | "planner"
    | "logistics"
    | "research"
    | "budget"
    | "safety"
    | "orchestrator"
    | "default";

/**
 * Model assigned to each agent when the provider is OpenAI.
 * Reasoning/planning roles get gpt-4.1; evaluation/small roles get gpt-4.1-mini.
 */
const AGENT_MODELS: Record<AgentRole, string> = {
    planner:      "gpt-4.1",
    logistics:    "gpt-4.1",
    research:     "gpt-4.1-mini",
    budget:       "gpt-4.1-mini",
    safety:       "gpt-4.1-mini",
    orchestrator: "gpt-4.1-mini",
    default:      "gpt-4.1-mini",
};

/**
 * Lightweight LLMClient wrapper that injects the per-agent model as a default.
 * Callers can still override by passing options.model explicitly.
 */
class AgentScopedLLMClient implements LLMClient {
    constructor(
        readonly inner: LLMClient,
        private readonly agentModel: string,
    ) {}

    execute(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<LLMResponse> {
        return this.inner.execute(messages, {
            ...options,
            model: options.model ?? this.agentModel,
        });
    }
}

export type CreateOptions =
    | LLMProvider               // backward-compatible: create("openai")
    | { agent: AgentRole }      // per-agent routing:   create({ agent: "planner" })
    | undefined;                // env-driven default:  create()

class LLMClientFactory {
    /**
     * Base singleton: the raw provider client (OpenAILLMClient, GeminiLLMClient, …).
     * AgentScopedLLMClient wraps this with a per-agent model string — it is NOT
     * cached itself so each create({ agent }) call returns a fresh lightweight wrapper
     * around the same underlying client.
     */
    private static baseInstance: LLMClient | null = null;

    static create(options?: CreateOptions): LLMClient {
        // Resolve the provider string from the argument or env
        const provider = this.resolveProvider(options);
        const base = this.getOrCreateBase(provider);

        // If a named agent role was requested and we are on OpenAI, wrap with scoped model
        if (
            options !== null &&
            typeof options === "object" &&
            "agent" in options &&
            provider === "openai"
        ) {
            const model = AGENT_MODELS[options.agent] ?? AGENT_MODELS.default;
            return new AgentScopedLLMClient(base, model);
        }

        return base;
    }

    private static resolveProvider(options?: CreateOptions): LLMProvider {
        if (typeof options === "string") {
            const p = options as LLMProvider;
            if (p !== "openai" && p !== "gemini") {
                throw new AIServiceError("LLM_ERROR", `Invalid LLM provider: "${String(options)}"`);
            }
            return p;
        }
        try {
            return resolveRealLlmProvider();
        } catch (e) {
            throw new AIServiceError("LLM_ERROR", (e as Error).message, e);
        }
    }

    private static getOrCreateBase(provider: LLMProvider): LLMClient {
        if (this.baseInstance) return this.baseInstance;

        const isProduction = process.env.NODE_ENV === "production";
        if (isProduction && provider !== "openai" && provider !== "gemini") {
            throw new AIServiceError(
                "LLM_ERROR",
                `LLM_PROVIDER must be "openai" or "gemini" in production. Got: "${provider}".`,
            );
        }

        switch (provider) {
            case "gemini": {
                const key = process.env.GEMINI_API_KEY;
                if (!key) throw new AIServiceError("LLM_ERROR", "GEMINI_API_KEY is not set");
                this.baseInstance = new GeminiLLMClient(key);
                break;
            }
            case "openai": {
                const key = process.env.OPENAI_API_KEY;
                if (!key) throw new AIServiceError("LLM_ERROR", "OPENAI_API_KEY is not set");
                this.baseInstance = new OpenAILLMClient(key, AGENT_MODELS.default);
                break;
            }
        }

        return this.baseInstance!;
    }

    /** Reset singletons — used in tests. */
    static reset(): void {
        this.baseInstance = null;
    }
}

/**
 * Creates a fresh (non-singleton) LLM client for a specific provider.
 * Use when you need a particular model regardless of the global LLM_PROVIDER
 * setting — e.g. ResearchAgent always using OpenAI GPT-4.1.
 */
export function createLLMClient(provider: LLMProvider): LLMClient {
    switch (provider) {
        case "openai": {
            const key = process.env.OPENAI_API_KEY;
            if (!key) throw new AIServiceError("LLM_ERROR", "OPENAI_API_KEY is not set");
            return new OpenAILLMClient(key);
        }
        case "gemini": {
            const key = process.env.GEMINI_API_KEY;
            if (!key) throw new AIServiceError("LLM_ERROR", "GEMINI_API_KEY is not set");
            return new GeminiLLMClient(key);
        }
    }
}

// ─────────────────────────────────────────
//  Retry Wrapper
// ─────────────────────────────────────────

function clientProviderLabel(client: LLMClient): "openai" | "gemini" {
    if (client instanceof OpenAILLMClient) return "openai";
    if (client instanceof GeminiLLMClient) return "gemini";
    if (client instanceof AgentScopedLLMClient) return clientProviderLabel(client.inner);
    return "openai";
}

export async function executeWithRetry(
    client: LLMClient,
    messages: LLMMessage[],
    options: LLMRequestOptions = {},
    agentName?: string,
): Promise<LLMResponse> {
    const maxRetries = options.retries ?? 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff
    const t0 = Date.now();

    let lastError: Error | null = null;
    let shouldFallback = false;

    const resolvedProvider = clientProviderLabel(client);
    const modelUsed = options.model ?? "default";
    const agent = agentName ?? "default";
    const endpoint = getRequestPathname() ?? "unknown";

    aiActiveRequests.inc({ provider: resolvedProvider, agent });

    const logFinalFailure = (errorCode?: string) => {
        const latencyMs = Math.max(0, Date.now() - t0);
        void logLLMCallFailure({
            provider:  resolvedProvider,
            modelUsed,
            latencyMs,
            requestId: getRequestId(),
            endpoint,
        });
        recordLLMCall({
            provider: resolvedProvider, model: modelUsed, agent, endpoint,
            promptTokens: 0, completionTokens: 0, latencyMs,
            status: "error", errorCode: errorCode ?? "LLM_ERROR",
        });
        aiActiveRequests.dec({ provider: resolvedProvider, agent });
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            logStructured({ layer: "llm", step: "llm-call", data: { provider: resolvedProvider, model: options.model ?? "default", attempt: attempt + 1 } });
            const response = await client.execute(messages, options);
            logStructured({ layer: "llm", step: "llm-response", data: { provider: response.provider, model: response.modelUsed, latencyMs: response.latencyMs, totalTokens: response.totalTokens } });
            logLLMUsage(response, {
                requestId: getRequestId(),
                endpoint,
            }).catch(() => { });
            recordLLMCall({
                provider: response.provider, model: response.modelUsed, agent, endpoint,
                promptTokens: response.promptTokens, completionTokens: response.completionTokens,
                latencyMs: response.latencyMs, status: "success",
            });
            aiActiveRequests.dec({ provider: resolvedProvider, agent });
            return response;
        } catch (err) {
            lastError = err as Error;

            // Don't retry on non-retryable errors
            if (err instanceof AIServiceError) {
                const nonRetryable: AIError["code"][] = [
                    "INVALID_INPUT",
                    "SCHEMA_VALIDATION_FAILED",
                    "CONTEXT_TOO_LARGE",
                ];
                if (nonRetryable.includes(err.code)) {
                    logFinalFailure(err.code);
                    throw err; // these don't fallback since they are logic/data errors
                }

                // If rate limited and a fallback exists, skip straight to it
                if (err.code === "RATE_LIMIT_EXCEEDED") {
                    const hasFallback =
                        (!(client instanceof OpenAILLMClient) && process.env.OPENAI_API_KEY) ||
                        (!(client instanceof GeminiLLMClient) && process.env.GEMINI_API_KEY);
                    if (hasFallback) {
                        shouldFallback = true;
                        break;
                    } else {
                        aiTimeoutsTotal.inc({ provider: resolvedProvider, model: modelUsed, agent });
                        logFinalFailure("RATE_LIMIT_EXCEEDED");
                        throw err;
                    }
                }
            }

            if (attempt < maxRetries) {
                const delay = retryDelays[attempt] ?? 4000;
                logInfo("[LLM] Attempt failed, retrying", {
                    attempt: attempt + 1,
                    delayMs: delay,
                    message: (err as Error).message,
                    level: "warn",
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                const hasFallback =
                    (!(client instanceof OpenAILLMClient) && process.env.OPENAI_API_KEY) ||
                    (!(client instanceof GeminiLLMClient) && process.env.GEMINI_API_KEY);
                if (hasFallback) {
                    shouldFallback = true;
                }
            }
        }
    }

    // Fallback: try OpenAI → Gemini in priority order when primary fails
    if (shouldFallback) {
        if (!(client instanceof OpenAILLMClient) && process.env.OPENAI_API_KEY) {
            logStructured({ layer: "llm", step: "fallback", data: { from: resolvedProvider, to: "openai", reason: lastError?.message } });
            logInfo("[LLM] Primary failed — falling back to OpenAI", { primaryError: lastError?.message });
            try {
                const fallbackClient = new OpenAILLMClient(process.env.OPENAI_API_KEY);
                const fallbackResponse = await fallbackClient.execute(messages, { ...options, timeoutMs: options.timeoutMs ?? 25_000 });
                logStructured({ layer: "llm", step: "llm-response", data: { provider: fallbackResponse.provider, model: fallbackResponse.modelUsed, latencyMs: fallbackResponse.latencyMs, fallback: true } });
                logLLMUsage(fallbackResponse, { requestId: getRequestId(), endpoint }).catch(() => { });
                recordLLMCall({
                    provider: fallbackResponse.provider, model: fallbackResponse.modelUsed, agent, endpoint,
                    promptTokens: fallbackResponse.promptTokens, completionTokens: fallbackResponse.completionTokens,
                    latencyMs: fallbackResponse.latencyMs, status: "fallback",
                    isFallback: true, fromProvider: resolvedProvider,
                });
                aiActiveRequests.dec({ provider: resolvedProvider, agent });
                return fallbackResponse;
            } catch (fallbackErr) {
                logError("[LLM] OpenAI fallback failed", fallbackErr);
                // continue to Gemini
            }
        }
        if (!(client instanceof GeminiLLMClient) && process.env.GEMINI_API_KEY) {
            logStructured({ layer: "llm", step: "fallback", data: { from: resolvedProvider, to: "gemini", reason: lastError?.message } });
            logInfo("[LLM] Primary failed — falling back to Gemini", { primaryError: lastError?.message });
            try {
                const fallbackClient = new GeminiLLMClient(process.env.GEMINI_API_KEY);
                const fallbackResponse = await fallbackClient.execute(messages, { ...options, timeoutMs: options.timeoutMs ?? 30_000 });
                logStructured({ layer: "llm", step: "llm-response", data: { provider: fallbackResponse.provider, model: fallbackResponse.modelUsed, latencyMs: fallbackResponse.latencyMs, fallback: true } });
                logLLMUsage(fallbackResponse, { requestId: getRequestId(), endpoint }).catch(() => { });
                recordLLMCall({
                    provider: fallbackResponse.provider, model: fallbackResponse.modelUsed, agent, endpoint,
                    promptTokens: fallbackResponse.promptTokens, completionTokens: fallbackResponse.completionTokens,
                    latencyMs: fallbackResponse.latencyMs, status: "fallback",
                    isFallback: true, fromProvider: resolvedProvider,
                });
                aiActiveRequests.dec({ provider: resolvedProvider, agent });
                return fallbackResponse;
            } catch (fallbackErr) {
                logError("[LLM] Gemini fallback failed", fallbackErr);
                logFinalFailure("LLM_ERROR");
                throw new AIServiceError("LLM_ERROR", "All AI providers failed", {
                    primaryError: lastError?.message,
                    fallbackError: (fallbackErr as Error).message,
                });
            }
        }
    }

    logFinalFailure("LLM_ERROR");
    throw new AIServiceError(
        "LLM_ERROR",
        `LLM request failed after ${maxRetries} retries: ${lastError?.message}`,
        lastError
    );
}

// ─────────────────────────────────────────
//  JSON Parsing Utility
// ─────────────────────────────────────────

/**
 * Safely parses LLM response content as JSON.
 *
 * Three-strategy extraction handles every common LLM output pattern:
 *  1. JSON inside a markdown code fence (anywhere in the text, not just at start)
 *  2. Raw JSON object embedded in surrounding prose — finds first `{` … last `}`
 *  3. Direct parse of the trimmed string (model obeyed the "JSON only" instruction)
 *
 * If all three fail the raw content (first 500 chars) is attached to the error
 * so it can be inspected in logs without leaking sensitive data.
 */
export function parseJSONResponse<T = unknown>(content: string): T {
    // Strategy 1 — extract from ```json … ``` or ``` … ``` fences anywhere in response.
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
        try {
            return JSON.parse(fenceMatch[1].trim()) as T;
        } catch {
            // fall through
        }
    }

    // Strategy 2 — find the outermost JSON object by locating first `{` and last `}`.
    // Handles responses like: "Here is the itinerary:\n\n{ … }"
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as T;
        } catch {
            // fall through
        }
    }

    // Strategy 3 — model followed instructions; try the trimmed string directly.
    try {
        return JSON.parse(content.trim()) as T;
    } catch {
        throw new AIServiceError(
            "SCHEMA_VALIDATION_FAILED",
            "LLM returned invalid JSON",
            { rawContent: content.substring(0, 500) }
        );
    }
}

// ─────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────

export const getLLMClient = (): LLMClient => LLMClientFactory.create();
export { LLMClientFactory };
export { AIErrorSchema };
