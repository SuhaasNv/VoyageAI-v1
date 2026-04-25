/**
 * tests/lib/llm.test.ts
 *
 * Unit tests for src/lib/ai/llm.ts:
 *   - AIServiceError class shape and toJSON
 *   - executeWithRetry: success, non-retryable errors, retries on transient errors
 *
 * The LLMClient is duck-typed (implements execute()) so no real API calls are made.
 * Retry delays are mocked via vi.useFakeTimers().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
vi.mock("@/infrastructure/logger", () => ({
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    logStructured: vi.fn(),
    trunc:         vi.fn((s: string) => s),
}));

vi.mock("@/services/logging/usageLogger", () => ({
    logLLMUsage:        vi.fn().mockResolvedValue(undefined),
    logLLMCallFailure:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/requestContext", () => ({
    getRequestId:       vi.fn().mockReturnValue("req-test-123"),
    getRequestPathname: vi.fn().mockReturnValue("/api/test"),
}));

import { AIServiceError, executeWithRetry, parseJSONResponse, LLMClientFactory, getLLMClient, createLLMClient } from "@/lib/ai/llm";
import type { LLMClient, LLMMessage, LLMRequestOptions, LLMResponse } from "@/lib/ai/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
    return {
        content:           '{"ok":true}',
        modelUsed:         "mock-model",
        promptTokens:      10,
        completionTokens:  20,
        totalTokens:       30,
        latencyMs:         50,
        provider:          "openai",
        ...overrides,
    };
}

function makeMockClient(executeFn: (messages: LLMMessage[], options?: LLMRequestOptions) => Promise<LLMResponse>): LLMClient {
    return { execute: executeFn };
}

const MESSAGES: LLMMessage[] = [
    { role: "user", content: "Plan a 3-day trip to Tokyo" },
];

// ═════════════════════════════════════════════════════════════════════════════
// AIServiceError
// ═════════════════════════════════════════════════════════════════════════════

describe("AIServiceError", () => {
    it("name is 'AIServiceError'", () => {
        const e = new AIServiceError("LLM_ERROR", "Test error");
        expect(e.name).toBe("AIServiceError");
    });

    it("instanceof Error", () => {
        const e = new AIServiceError("LLM_ERROR", "Test error");
        expect(e).toBeInstanceOf(Error);
    });

    it("carries code and message", () => {
        const e = new AIServiceError("RATE_LIMIT_EXCEEDED", "Too many requests");
        expect(e.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(e.message).toBe("Too many requests");
    });

    it("carries optional details and retryAfter", () => {
        const e = new AIServiceError("LLM_ERROR", "msg", { extra: 1 }, 60);
        expect(e.details).toEqual({ extra: 1 });
        expect(e.retryAfter).toBe(60);
    });

    it("toJSON returns correct AIError shape", () => {
        const e = new AIServiceError("INVALID_INPUT", "Bad input", "ctx", 30);
        const json = e.toJSON();
        expect(json).toEqual({
            code:       "INVALID_INPUT",
            message:    "Bad input",
            details:    "ctx",
            retryAfter: 30,
        });
    });

    it("toJSON omits undefined optional fields", () => {
        const e    = new AIServiceError("LLM_ERROR", "Fail");
        const json = e.toJSON();
        expect(json.code).toBe("LLM_ERROR");
        expect(json.message).toBe("Fail");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// executeWithRetry — success path
// ═════════════════════════════════════════════════════════════════════════════

describe("executeWithRetry — success on first attempt", () => {
    it("returns the response from client.execute", async () => {
        const expected = makeResponse({ content: '{"plan":"day 1"}' });
        const client   = makeMockClient(async () => expected);

        const result = await executeWithRetry(client, MESSAGES, { retries: 1 });
        expect(result.content).toBe('{"plan":"day 1"}');
    });

    it("passes options.model down to the client", async () => {
        let capturedOptions: LLMRequestOptions | undefined;
        const client = makeMockClient(async (_, opts) => {
            capturedOptions = opts;
            return makeResponse();
        });

        await executeWithRetry(client, MESSAGES, { model: "gpt-4.1-mini", retries: 0 });
        expect(capturedOptions?.model).toBe("gpt-4.1-mini");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// executeWithRetry — non-retryable errors (immediate throw)
// ═════════════════════════════════════════════════════════════════════════════

describe("executeWithRetry — non-retryable AIServiceErrors are thrown immediately", () => {
    const nonRetryableCodes = [
        "INVALID_INPUT",
        "SCHEMA_VALIDATION_FAILED",
        "CONTEXT_TOO_LARGE",
    ] as const;

    for (const code of nonRetryableCodes) {
        it(`throws ${code} without retrying`, async () => {
            let callCount = 0;
            const client  = makeMockClient(async () => {
                callCount++;
                throw new AIServiceError(code, `Non-retryable: ${code}`);
            });

            await expect(
                executeWithRetry(client, MESSAGES, { retries: 3 })
            ).rejects.toBeInstanceOf(AIServiceError);

            expect(callCount).toBe(1); // called exactly once — no retries
        });
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// executeWithRetry — retries on transient errors
// ═════════════════════════════════════════════════════════════════════════════

describe("executeWithRetry — retries on transient LLM_ERROR", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Stub away real API keys so the fallback path does not
        // attempt to create real LLM clients when retries are exhausted.
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("GEMINI_API_KEY", "");
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("succeeds on the 2nd attempt after 1 transient failure", async () => {
        let callCount  = 0;
        const expected = makeResponse();
        const client   = makeMockClient(async () => {
            callCount++;
            if (callCount === 1) throw new AIServiceError("LLM_ERROR", "Transient error");
            return expected;
        });

        const resultPromise = executeWithRetry(client, MESSAGES, { retries: 2 });
        await vi.advanceTimersByTimeAsync(1100);

        const result = await resultPromise;
        expect(result).toBe(expected);
        expect(callCount).toBe(2);
    });

    it("throws after exhausting all retries with no fallback", async () => {
        let callCount = 0;
        const client  = makeMockClient(async () => {
            callCount++;
            throw new AIServiceError("LLM_ERROR", "Always fails");
        });

        const resultPromise = executeWithRetry(client, MESSAGES, { retries: 2 });
        // Attach rejection handler BEFORE advancing timers to avoid
        // an unhandled-rejection window between the timer firing and the assertion.
        const expectRejection = expect(resultPromise).rejects.toBeInstanceOf(AIServiceError);
        await vi.advanceTimersByTimeAsync(10_000);
        await expectRejection;

        expect(callCount).toBe(3); // initial + 2 retries
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// executeWithRetry — retries=0 means only one attempt
// ═════════════════════════════════════════════════════════════════════════════

describe("executeWithRetry — retries=0", () => {
    beforeEach(() => {
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("GEMINI_API_KEY", "");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("does not retry when retries=0 and always throws", async () => {
        let callCount = 0;
        const client  = makeMockClient(async () => {
            callCount++;
            throw new AIServiceError("LLM_ERROR", "Fail once");
        });

        await expect(
            executeWithRetry(client, MESSAGES, { retries: 0 })
        ).rejects.toBeInstanceOf(AIServiceError);

        expect(callCount).toBe(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// parseJSONResponse — three extraction strategies
// ═════════════════════════════════════════════════════════════════════════════

describe("parseJSONResponse — strategy 1: markdown code fence", () => {
    it("extracts JSON from ```json ... ``` fence", () => {
        const content = 'Here is the result:\n```json\n{"ok":true}\n```\n';
        const result = parseJSONResponse<{ ok: boolean }>(content);
        expect(result).toEqual({ ok: true });
    });

    it("extracts JSON from ``` ... ``` fence without language tag", () => {
        const content = "```\n{\"value\":42}\n```";
        const result = parseJSONResponse<{ value: number }>(content);
        expect(result.value).toBe(42);
    });
});

describe("parseJSONResponse — strategy 2: first { ... last }", () => {
    it("extracts embedded JSON surrounded by prose", () => {
        const content = 'Here is the plan: {"destination":"Tokyo","days":3} and that is it.';
        const result = parseJSONResponse<{ destination: string; days: number }>(content);
        expect(result.destination).toBe("Tokyo");
        expect(result.days).toBe(3);
    });
});

describe("parseJSONResponse — strategy 3: direct JSON", () => {
    it("parses a clean JSON string directly", () => {
        const content = '{"name":"Paris","cost":2000}';
        const result = parseJSONResponse<{ name: string; cost: number }>(content);
        expect(result.name).toBe("Paris");
        expect(result.cost).toBe(2000);
    });

    it("handles leading/trailing whitespace", () => {
        const content = '   {"x":1}   ';
        const result = parseJSONResponse<{ x: number }>(content);
        expect(result.x).toBe(1);
    });
});

describe("parseJSONResponse — throws on completely invalid JSON", () => {
    it("throws AIServiceError with code SCHEMA_VALIDATION_FAILED", () => {
        try {
            parseJSONResponse("This is not JSON at all — no braces, no fences.");
            expect.fail("Should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(AIServiceError);
            expect((e as AIServiceError).code).toBe("SCHEMA_VALIDATION_FAILED");
        }
    });

    it("attaches rawContent (first 500 chars) to error details", () => {
        const raw = "x".repeat(600);
        try {
            parseJSONResponse(raw);
        } catch (e) {
            const details = (e as AIServiceError).details as { rawContent: string };
            expect(details.rawContent).toHaveLength(500);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// LLMClientFactory.create() and getLLMClient
// ═════════════════════════════════════════════════════════════════════════════

describe("LLMClientFactory.create — with env keys", () => {
    beforeEach(() => {
        LLMClientFactory.reset();
    });
    afterEach(() => {
        LLMClientFactory.reset();
        vi.unstubAllEnvs();
    });

    it("creates an OpenAI client when LLM_PROVIDER=openai and key is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        const client = LLMClientFactory.create();
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });

    it("creates a Gemini client when LLM_PROVIDER=gemini and key is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "gemini");
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        const client = LLMClientFactory.create();
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });

    it("throws when LLM_PROVIDER=openai but no key", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("GEMINI_API_KEY", "");
        expect(() => LLMClientFactory.create()).toThrow(AIServiceError);
    });

    it("throws for invalid provider string", () => {
        vi.stubEnv("LLM_PROVIDER",   "invalid-provider");
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("GEMINI_API_KEY", "");
        expect(() => LLMClientFactory.create()).toThrow();
    });

    it("returns the same singleton on subsequent calls", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        const c1 = LLMClientFactory.create();
        const c2 = LLMClientFactory.create();
        expect(c1).toBe(c2);
    });

    it("creates an agent-scoped client for planner role (OpenAI)", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        const client = LLMClientFactory.create({ agent: "planner" });
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });

    it("getLLMClient returns a client", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        const client = getLLMClient();
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// createLLMClient — fresh non-singleton client
// ═════════════════════════════════════════════════════════════════════════════

describe("createLLMClient", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("creates an OpenAI client when key is set", () => {
        vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
        const client = createLLMClient("openai");
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });

    it("creates a Gemini client when key is set", () => {
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        const client = createLLMClient("gemini");
        expect(client).toBeDefined();
        expect(typeof client.execute).toBe("function");
    });

    it("throws AIServiceError when OPENAI_API_KEY is missing", () => {
        vi.stubEnv("OPENAI_API_KEY", "");
        expect(() => createLLMClient("openai")).toThrow(AIServiceError);
    });

    it("throws AIServiceError when GEMINI_API_KEY is missing", () => {
        vi.stubEnv("GEMINI_API_KEY", "");
        expect(() => createLLMClient("gemini")).toThrow(AIServiceError);
    });
});
