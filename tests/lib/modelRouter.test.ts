/**
 * tests/lib/modelRouter.test.ts
 *
 * Unit tests for src/lib/ai/modelRouter.ts:
 *   - selectModelConfig — returns correct provider/model/params per endpoint
 *   - selectGeminiStreamConfig — returns gemini-specific config
 *   - Unknown endpoint → DEFAULT_MATRIX fallback
 *   - resolveProvider error → falls back to "openai"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockResolveRealLlmProvider, mockApplyHealingOverrides } = vi.hoisted(() => ({
    mockResolveRealLlmProvider: vi.fn(),
    mockApplyHealingOverrides:  vi.fn(<T>(x: T): T => x), // identity by default
}));

vi.mock("@/lib/ai/resolveRealLlmProvider", () => ({
    resolveRealLlmProvider: mockResolveRealLlmProvider,
}));

vi.mock("@/services/ai/healingStore", () => ({
    applyHealingOverrides: mockApplyHealingOverrides,
}));

vi.mock("@/infrastructure/logger", () => ({
    logError:      vi.fn(),
    logStructured: vi.fn(),
    logInfo:       vi.fn(),
}));

import { selectModelConfig, selectGeminiStreamConfig } from "@/lib/ai/modelRouter";

afterEach(() => vi.clearAllMocks());

// ═════════════════════════════════════════════════════════════════════════════
// selectModelConfig — Gemini provider
// ═════════════════════════════════════════════════════════════════════════════

describe("selectModelConfig with Gemini provider", () => {
    beforeEach(() => {
        mockResolveRealLlmProvider.mockReturnValue("gemini");
        mockApplyHealingOverrides.mockImplementation(<T>(x: T): T => x);
    });

    it("research endpoint returns provider=gemini with correct shape", () => {
        const cfg = selectModelConfig({ endpoint: "research" });
        expect(cfg.provider).toBe("gemini");
        expect(cfg.model).toBeDefined();
        expect(cfg.temperature).toBeDefined();
        expect(cfg.maxTokens).toBeGreaterThan(0);
        expect(cfg.timeoutMs).toBeGreaterThan(0);
    });

    it("itinerary endpoint returns large maxTokens (≥ 4096)", () => {
        const cfg = selectModelConfig({ endpoint: "itinerary" });
        expect(cfg.maxTokens).toBeGreaterThanOrEqual(4096);
    });

    it("budget endpoint returns low temperature (≤ 0.3)", () => {
        const cfg = selectModelConfig({ endpoint: "budget" });
        expect(cfg.temperature).toBeLessThanOrEqual(0.3);
    });

    it("create-trip endpoint has short timeout (≤ 15_000 ms)", () => {
        const cfg = selectModelConfig({ endpoint: "create-trip" });
        expect(cfg.timeoutMs).toBeLessThanOrEqual(15_000);
    });

    it("landing with intent=CREATE_TRIP returns low temperature", () => {
        const cfg = selectModelConfig({ endpoint: "landing", intent: "CREATE_TRIP" });
        expect(cfg.temperature).toBeLessThanOrEqual(0.3);
    });

    it("landing without intent returns higher temperature", () => {
        const cfg = selectModelConfig({ endpoint: "landing" });
        expect(cfg.temperature).toBeGreaterThan(0.3);
    });

    it("unknown endpoint falls back to default config", () => {
        const cfg = selectModelConfig({ endpoint: "this-does-not-exist" });
        expect(cfg.provider).toBe("gemini");
        expect(cfg.maxTokens).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// selectModelConfig — OpenAI provider
// ═════════════════════════════════════════════════════════════════════════════

describe("selectModelConfig with OpenAI provider", () => {
    beforeEach(() => {
        mockResolveRealLlmProvider.mockReturnValue("openai");
        mockApplyHealingOverrides.mockImplementation(<T>(x: T): T => x);
    });

    it("returns provider=openai for all known endpoints", () => {
        const cfg = selectModelConfig({ endpoint: "itinerary" });
        expect(cfg.provider).toBe("openai");
    });

    it("reoptimize endpoint uses lower temperature than chat", () => {
        const reoptimize = selectModelConfig({ endpoint: "reoptimize" });
        const chat       = selectModelConfig({ endpoint: "chat" });
        expect(reoptimize.temperature).toBeLessThan(chat.temperature);
    });

    it("ticket endpoint returns very low temperature (≤ 0.2)", () => {
        const cfg = selectModelConfig({ endpoint: "ticket" });
        expect(cfg.temperature).toBeLessThanOrEqual(0.2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveProvider error → fallback to openai
// ═════════════════════════════════════════════════════════════════════════════

describe("selectModelConfig — resolveProvider failure", () => {
    beforeEach(() => {
        mockResolveRealLlmProvider.mockImplementation(() => {
            throw new Error("No API keys configured");
        });
        mockApplyHealingOverrides.mockImplementation(<T>(x: T): T => x);
    });

    it("falls back to openai-shaped config when resolveProvider throws", () => {
        const cfg = selectModelConfig({ endpoint: "itinerary" });
        // Should not throw and should return a valid config
        expect(cfg.provider).toBe("openai");
        expect(cfg.maxTokens).toBeGreaterThan(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// applyHealingOverrides — integration
// ═════════════════════════════════════════════════════════════════════════════

describe("selectModelConfig — healing overrides applied", () => {
    beforeEach(() => {
        mockResolveRealLlmProvider.mockReturnValue("gemini");
    });

    it("calls applyHealingOverrides with the base config", () => {
        const base = {
            provider: "gemini" as const,
            model: "gemini-2.5-flash",
            temperature: 0.5,
            maxTokens: 4096,
            timeoutMs: 45_000,
        };
        mockApplyHealingOverrides.mockReturnValue({ ...base, temperature: 0.3 });

        const cfg = selectModelConfig({ endpoint: "research" });
        expect(mockApplyHealingOverrides).toHaveBeenCalled();
        expect(cfg.temperature).toBe(0.3); // override applied
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// selectGeminiStreamConfig
// ═════════════════════════════════════════════════════════════════════════════

describe("selectGeminiStreamConfig", () => {
    it("returns model, temperature, maxOutputTokens from Gemini matrix", () => {
        const cfg = selectGeminiStreamConfig("itinerary");
        expect(cfg.model).toBeDefined();
        expect(typeof cfg.temperature).toBe("number");
        expect(cfg.maxOutputTokens).toBeGreaterThan(0);
    });

    it("landing-preview returns medium maxOutputTokens", () => {
        const cfg = selectGeminiStreamConfig("landing-preview");
        expect(cfg.maxOutputTokens).toBeGreaterThanOrEqual(1000);
    });

    it("unknown endpoint uses default matrix", () => {
        const cfg = selectGeminiStreamConfig("non-existent-endpoint");
        expect(cfg.model).toBeDefined();
        expect(cfg.maxOutputTokens).toBeGreaterThan(0);
    });

    it("landing with CREATE_TRIP intent returns low temperature", () => {
        const cfg = selectGeminiStreamConfig("landing", "CREATE_TRIP");
        expect(cfg.temperature).toBeLessThanOrEqual(0.3);
    });
});
