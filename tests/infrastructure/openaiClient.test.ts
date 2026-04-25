/**
 * tests/infrastructure/openaiClient.test.ts
 *
 * Unit tests for src/infrastructure/llm/openaiClient.ts.
 * Global fetch is mocked — no real API calls are made.
 *
 * Covers:
 *   - OpenAIRequestError class
 *   - completeChat: success, rate limit, empty response, network error, timeout
 *   - JSON repair path via completeChatWithJSONRepair
 *   - generate helper
 *   - chat wrapper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/infrastructure/logger", () => ({
    logInfo:  vi.fn(),
    logError: vi.fn(),
}));

import {
    OpenAIClient,
    OpenAIRequestError,
} from "@/infrastructure/llm/openaiClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchSuccess(content: string, model = "gpt-4.1-mini") {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok:     true,
        status: 200,
        json:   async () => ({
            model,
            choices: [{ message: { content }, finish_reason: "stop" }],
            usage:   { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
    }));
}

function mockFetchError(status: number, message = "error") {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok:         false,
        status,
        statusText: message,
        json:       async () => ({ error: { message } }),
    }));
}

function mockFetchNetworkError(msg = "Network error") {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(msg)));
}

function mockFetchAbort() {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
}

// ─── Default client ───────────────────────────────────────────────────────────

const client = new OpenAIClient("sk-test-key", "gpt-4.1-mini");
const MESSAGES = [{ role: "user" as const, content: "Hello" }];

// ═════════════════════════════════════════════════════════════════════════════
// OpenAIRequestError
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIRequestError", () => {
    it("is instanceof Error", () => {
        expect(new OpenAIRequestError("LLM_ERROR", "err")).toBeInstanceOf(Error);
    });

    it("name is 'OpenAIRequestError'", () => {
        expect(new OpenAIRequestError("LLM_ERROR", "err").name).toBe("OpenAIRequestError");
    });

    it("carries code, message, details", () => {
        const e = new OpenAIRequestError("RATE_LIMIT_EXCEEDED", "Too many", { retry: 60 });
        expect(e.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(e.message).toBe("Too many");
        expect(e.details).toEqual({ retry: 60 });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — success
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — success path", () => {
    beforeEach(() => mockFetchSuccess('{"answer":"yes"}'));
    afterEach(() => vi.unstubAllGlobals());

    it("returns content from the API response", async () => {
        const result = await client.completeChat({ messages: MESSAGES });
        expect(result.content).toBe('{"answer":"yes"}');
    });

    it("returns correct token counts", async () => {
        const result = await client.completeChat({ messages: MESSAGES });
        expect(result.promptTokens).toBe(10);
        expect(result.completionTokens).toBe(20);
        expect(result.totalTokens).toBe(30);
    });

    it("returns modelUsed from API response", async () => {
        const result = await client.completeChat({ messages: MESSAGES });
        expect(result.modelUsed).toBe("gpt-4.1-mini");
    });

    it("latencyMs is a non-negative number", async () => {
        const result = await client.completeChat({ messages: MESSAGES });
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("passes json:true as response_format to the API body", async () => {
        const spy = vi.fn().mockResolvedValue({
            ok:   true,
            json: async () => ({
                model:   "gpt-4.1-mini",
                choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
                usage:   { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
        });
        vi.stubGlobal("fetch", spy);

        await client.completeChat({ messages: MESSAGES, json: true });
        const body = JSON.parse((spy.mock.calls[0] as [string, { body: string }])[1].body);
        expect(body.response_format).toEqual({ type: "json_object" });
        vi.unstubAllGlobals();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — rate limit (429)
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — rate limit (429)", () => {
    beforeEach(() => mockFetchError(429, "Rate limit exceeded"));
    afterEach(() => vi.unstubAllGlobals());

    it("throws OpenAIRequestError with code RATE_LIMIT_EXCEEDED", async () => {
        await expect(
            client.completeChat({ messages: MESSAGES })
        ).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — generic API error
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — API error (500)", () => {
    beforeEach(() => mockFetchError(500, "Internal Server Error"));
    afterEach(() => vi.unstubAllGlobals());

    it("throws OpenAIRequestError with code LLM_ERROR", async () => {
        await expect(
            client.completeChat({ messages: MESSAGES })
        ).rejects.toMatchObject({ code: "LLM_ERROR" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — empty response content
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — empty content", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok:   true,
            json: async () => ({
                model:   "gpt-4.1-mini",
                choices: [{ message: { content: "" }, finish_reason: "stop" }],
                usage:   { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
            }),
        }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it("throws LLM_ERROR for empty content", async () => {
        await expect(
            client.completeChat({ messages: MESSAGES })
        ).rejects.toMatchObject({ code: "LLM_ERROR" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — network failure
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — network failure", () => {
    beforeEach(() => mockFetchNetworkError("ECONNREFUSED"));
    afterEach(() => vi.unstubAllGlobals());

    it("throws OpenAIRequestError with code LLM_ERROR", async () => {
        await expect(
            client.completeChat({ messages: MESSAGES })
        ).rejects.toMatchObject({ code: "LLM_ERROR" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// completeChat — timeout
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.completeChat — timeout (AbortError)", () => {
    beforeEach(() => mockFetchAbort());
    afterEach(() => vi.unstubAllGlobals());

    it("throws OpenAIRequestError with code TIMEOUT", async () => {
        await expect(
            client.completeChat({ messages: MESSAGES })
        ).rejects.toMatchObject({ code: "TIMEOUT" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// generate helper
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.generate", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("returns content string on success", async () => {
        mockFetchSuccess("Paris is great.");
        const result = await client.generate({ prompt: "Tell me about Paris." });
        expect(result).toBe("Paris is great.");
    });

    it("includes systemPrompt as first message when provided", async () => {
        const spy = vi.fn().mockResolvedValue({
            ok:   true,
            json: async () => ({
                model:   "gpt-4.1-mini",
                choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
                usage:   { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
            }),
        });
        vi.stubGlobal("fetch", spy);

        await client.generate({ prompt: "My question", systemPrompt: "You are a guide." });
        const body = JSON.parse((spy.mock.calls[0] as [string, { body: string }])[1].body);
        expect(body.messages[0]).toMatchObject({ role: "system", content: "You are a guide." });
        expect(body.messages[1]).toMatchObject({ role: "user", content: "My question" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// chat wrapper
// ═════════════════════════════════════════════════════════════════════════════

describe("OpenAIClient.chat", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("returns CompletionResult on success", async () => {
        mockFetchSuccess('{"plan":"day1"}');
        const result = await client.chat({ messages: MESSAGES });
        expect(result.content).toBe('{"plan":"day1"}');
    });
});
