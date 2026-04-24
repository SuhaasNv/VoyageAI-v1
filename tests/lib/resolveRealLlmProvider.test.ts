/**
 * tests/lib/resolveRealLlmProvider.test.ts
 *
 * Unit tests for src/lib/ai/resolveRealLlmProvider.ts:
 *   - All branching: pref=openai, pref=gemini, no pref, fallback, throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveRealLlmProvider } from "@/lib/ai/resolveRealLlmProvider";

beforeEach(() => {
    // Clear env between tests to get predictable results
    vi.stubEnv("LLM_PROVIDER",    "");
    vi.stubEnv("OPENAI_API_KEY",  "");
    vi.stubEnv("GEMINI_API_KEY",  "");
});

afterEach(() => vi.unstubAllEnvs());

// ═════════════════════════════════════════════════════════════════════════════
// LLM_PROVIDER = openai
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveRealLlmProvider — LLM_PROVIDER=openai", () => {
    it("returns 'openai' when pref=openai and OPENAI_API_KEY is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
        expect(resolveRealLlmProvider()).toBe("openai");
    });

    it("falls back to 'gemini' when pref=openai but only GEMINI_API_KEY is set", () => {
        vi.stubEnv("LLM_PROVIDER",  "openai");
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        expect(resolveRealLlmProvider()).toBe("gemini");
    });

    it("throws when pref=openai and neither key is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "openai");
        expect(() => resolveRealLlmProvider()).toThrow(/OPENAI_API_KEY/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// LLM_PROVIDER = gemini
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveRealLlmProvider — LLM_PROVIDER=gemini", () => {
    it("returns 'gemini' when pref=gemini and GEMINI_API_KEY is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "gemini");
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        expect(resolveRealLlmProvider()).toBe("gemini");
    });

    it("falls back to 'openai' when pref=gemini but only OPENAI_API_KEY is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "gemini");
        vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
        expect(resolveRealLlmProvider()).toBe("openai");
    });

    it("throws when pref=gemini and neither key is set", () => {
        vi.stubEnv("LLM_PROVIDER",   "gemini");
        expect(() => resolveRealLlmProvider()).toThrow(/GEMINI_API_KEY/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// No preference
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveRealLlmProvider — no LLM_PROVIDER set", () => {
    it("returns 'openai' when only OPENAI_API_KEY is set", () => {
        vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
        expect(resolveRealLlmProvider()).toBe("openai");
    });

    it("returns 'gemini' when only GEMINI_API_KEY is set", () => {
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        expect(resolveRealLlmProvider()).toBe("gemini");
    });

    it("prefers 'openai' when both keys are set and no preference", () => {
        vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
        vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
        expect(resolveRealLlmProvider()).toBe("openai");
    });

    it("throws when neither key is set", () => {
        expect(() => resolveRealLlmProvider()).toThrow(/No LLM API keys/);
    });
});
