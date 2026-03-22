/**
 * OpenAIClient — production-grade OpenAI transport.
 *
 * Exposes two surfaces:
 *   - generate({ prompt, ... })  — single-prompt helper used by new callsites
 *   - completeChat({ messages, ... }) — multi-turn path; used by the LLMClient
 *     adapter in llm.ts so all agents keep their existing execute() interface
 *
 * JSON hardening: when json=true, attempts JSON.parse after the first response.
 * If parsing fails, a single repair follow-up is sent and the result is returned
 * or an AIServiceError is thrown.
 *
 * All token + latency metadata is returned so callers can build LLMResponse.
 */

import { logInfo, logError } from "@/infrastructure/logger";

// ─── Re-exported so llm.ts can import from one place ─────────────────────────

export class OpenAIRequestError extends Error {
    constructor(
        public readonly code: "LLM_ERROR" | "RATE_LIMIT_EXCEEDED" | "TIMEOUT",
        message: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = "OpenAIRequestError";
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
    prompt: string;
    /** Prepended as the `system` role message if provided. */
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** When true, requests json_object response_format and validates the output. */
    json?: boolean;
    model?: string;
    timeoutMs?: number;
}

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface CompleteChatOptions {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    json?: boolean;
    timeoutMs?: number;
}

export interface CompletionResult {
    content: string;
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
}

// ─── JSON extraction (mirrors strategy in parseJSONResponse) ─────────────────

function extractJSON(raw: string): string | null {
    // Strategy 1 — markdown fence
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
        try {
            JSON.parse(fenceMatch[1].trim());
            return fenceMatch[1].trim();
        } catch {
            /* fall through */
        }
    }
    // Strategy 2 — first { … last }
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last > first) {
        const candidate = raw.slice(first, last + 1);
        try {
            JSON.parse(candidate);
            return candidate;
        } catch {
            /* fall through */
        }
    }
    // Strategy 3 — raw trim
    const trimmed = raw.trim();
    try {
        JSON.parse(trimmed);
        return trimmed;
    } catch {
        return null;
    }
}

// ─── OpenAIClient ─────────────────────────────────────────────────────────────

export class OpenAIClient {
    private readonly apiKey: string;
    readonly defaultModel: string;
    private readonly baseUrl = "https://api.openai.com/v1";

    constructor(apiKey: string, defaultModel = "gpt-4.1-mini") {
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
    }

    // ── Low-level HTTP completion ─────────────────────────────────────────────

    async completeChat(opts: CompleteChatOptions): Promise<CompletionResult> {
        const {
            messages,
            temperature = 0.7,
            maxTokens = 4096,
            json = false,
            timeoutMs = 30_000,
        } = opts;
        const model = opts.model ?? this.defaultModel;
        const startTime = Date.now();

        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const body: Record<string, unknown> = {
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
            };
            if (json) {
                body.response_format = { type: "json_object" };
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timerId);

            if (!response.ok) {
                let errBody: Record<string, unknown> = {};
                try {
                    errBody = await response.json() as Record<string, unknown>;
                } catch {
                    /* ignore parse errors on error bodies */
                }
                const openaiMsg =
                    (errBody?.error as { message?: string })?.message ?? response.statusText;
                throw new OpenAIRequestError(
                    response.status === 429 ? "RATE_LIMIT_EXCEEDED" : "LLM_ERROR",
                    `OpenAI API error ${response.status}: ${openaiMsg}`,
                    errBody,
                );
            }

            const data = await response.json() as {
                model?: string;
                choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
                usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };
            const choice = data.choices?.[0];
            const rawContent = choice?.message?.content ?? "";

            if (!rawContent) {
                throw new OpenAIRequestError(
                    "LLM_ERROR",
                    `Empty response from OpenAI (finish_reason: ${choice?.finish_reason ?? "unknown"})`,
                );
            }

            const latencyMs = Date.now() - startTime;
            logInfo("[OpenAIClient] completion", { model, latencyMs });

            return {
                content: rawContent,
                modelUsed: data.model ?? model,
                promptTokens: data.usage?.prompt_tokens ?? 0,
                completionTokens: data.usage?.completion_tokens ?? 0,
                totalTokens: data.usage?.total_tokens ?? 0,
                latencyMs,
            };
        } catch (err) {
            clearTimeout(timerId);
            if (err instanceof OpenAIRequestError) throw err;
            if ((err as Error).name === "AbortError") {
                throw new OpenAIRequestError("TIMEOUT", `OpenAI request timed out after ${timeoutMs}ms`);
            }
            logError("[OpenAIClient] fetch error", { model, message: (err as Error).message });
            throw new OpenAIRequestError(
                "LLM_ERROR",
                `OpenAI request failed: ${(err as Error).message}`,
                err,
            );
        }
    }

    // ── JSON-hardened repair path ─────────────────────────────────────────────

    private async completeChatWithJSONRepair(opts: CompleteChatOptions): Promise<CompletionResult> {
        const result = await this.completeChat(opts);

        const parsed = extractJSON(result.content);
        if (parsed !== null) {
            return { ...result, content: parsed };
        }

        // One repair attempt
        logInfo("[OpenAIClient] JSON parse failed — attempting repair", { model: opts.model ?? this.defaultModel });
        const repairMessages: ChatMessage[] = [
            ...opts.messages,
            { role: "assistant", content: result.content },
            {
                role: "user",
                content:
                    "Your previous output was not valid JSON. " +
                    "Return ONLY a valid JSON object — no markdown, no explanation.",
            },
        ];

        const repaired = await this.completeChat({ ...opts, messages: repairMessages });
        const repairedParsed = extractJSON(repaired.content);
        if (repairedParsed !== null) {
            return { ...repaired, content: repairedParsed };
        }

        throw new OpenAIRequestError(
            "LLM_ERROR",
            "OpenAI returned invalid JSON after repair attempt",
            { raw: result.content.substring(0, 300) },
        );
    }

    // ── Public: single-prompt generate ───────────────────────────────────────

    async generate(opts: GenerateOptions): Promise<string> {
        const messages: ChatMessage[] = [];
        if (opts.systemPrompt) {
            messages.push({ role: "system", content: opts.systemPrompt });
        }
        messages.push({ role: "user", content: opts.prompt });

        const completionOpts: CompleteChatOptions = {
            messages,
            model: opts.model ?? this.defaultModel,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
            json: opts.json,
            timeoutMs: opts.timeoutMs,
        };

        const result = opts.json
            ? await this.completeChatWithJSONRepair(completionOpts)
            : await this.completeChat(completionOpts);

        return result.content;
    }

    // ── Public: multi-turn with optional JSON repair ─────────────────────────

    async chat(opts: CompleteChatOptions): Promise<CompletionResult> {
        return opts.json
            ? this.completeChatWithJSONRepair(opts)
            : this.completeChat(opts);
    }
}
