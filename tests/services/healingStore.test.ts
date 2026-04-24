/**
 * tests/services/healingStore.test.ts
 *
 * Unit tests for src/services/ai/healingStore.ts — in-memory singleton.
 *
 * Each describe block resets state by calling clearHealingOverrides()
 * so tests are fully isolated.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/logger", () => ({
    logInfo:       vi.fn(),
    logError:      vi.fn(),
    logStructured: vi.fn(),
}));

import {
    getHealingStatus,
    setHealingOverrides,
    clearHealingOverrides,
    applyHealingOverrides,
    recordRunTimestamps,
} from "@/services/ai/healingStore";

// Reset singleton before every test
beforeEach(() => {
    // Calling clearHealingOverrides when already neutral is a no-op,
    // but after setHealingOverrides it brings state back to clean.
    // We force a set + clear to guarantee neutral state.
    setHealingOverrides(["no_action"], "OK", [], "reset", 0);
    clearHealingOverrides("test-reset");
});

// ═════════════════════════════════════════════════════════════════════════════
// getHealingStatus — initial state
// ═════════════════════════════════════════════════════════════════════════════

describe("getHealingStatus — initial / neutral state", () => {
    it("returns active=false when no healing overrides are set", () => {
        const status = getHealingStatus();
        expect(status.active).toBe(false);
    });

    it("returns assessment=OK", () => {
        const status = getHealingStatus();
        expect(status.assessment).toBe("OK");
    });

    it("returns empty activeActions", () => {
        expect(getHealingStatus().overrides.activeActions).toHaveLength(0);
    });

    it("overrides.maxTokensMultiplier is 1.0", () => {
        expect(getHealingStatus().overrides.maxTokensMultiplier).toBe(1.0);
    });

    it("overrides.preferFallbackProvider is false", () => {
        expect(getHealingStatus().overrides.preferFallbackProvider).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// setHealingOverrides
// ═════════════════════════════════════════════════════════════════════════════

describe("setHealingOverrides", () => {
    it("activates healing and sets assessment", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "MEDIUM", ["high_latency"], "latency spike", 30);
        const { active, assessment } = getHealingStatus();
        expect(active).toBe(true);
        expect(assessment).toBe("MEDIUM");
    });

    it("computes maxTokensMultiplier=0.75 for reduce_tokens_25pct", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 10);
        expect(getHealingStatus().overrides.maxTokensMultiplier).toBe(0.75);
    });

    it("computes maxTokensMultiplier=0.5 for reduce_tokens_50pct", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "HIGH", [], "test", 10);
        expect(getHealingStatus().overrides.maxTokensMultiplier).toBe(0.5);
    });

    it("50pct takes priority over 25pct when both present", () => {
        setHealingOverrides(["reduce_tokens_25pct", "reduce_tokens_50pct"], "HIGH", [], "test", 10);
        expect(getHealingStatus().overrides.maxTokensMultiplier).toBe(0.5);
    });

    it("sets reduceTimeouts=true for enable_timeout_reduction", () => {
        setHealingOverrides(["enable_timeout_reduction"], "MEDIUM", [], "slow", 10);
        expect(getHealingStatus().overrides.reduceTimeouts).toBe(true);
    });

    it("filters out no_action and clear_healing from activeActions", () => {
        setHealingOverrides(["no_action", "clear_healing", "reduce_tokens_25pct"], "LOW", [], "test", 10);
        const { activeActions } = getHealingStatus().overrides;
        expect(activeActions).not.toContain("no_action");
        expect(activeActions).not.toContain("clear_healing");
        expect(activeActions).toContain("reduce_tokens_25pct");
    });

    it("increments runCount on each call", () => {
        const before = getHealingStatus().runCount;
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 10);
        const after = getHealingStatus().runCount;
        expect(after).toBe(before + 1);
    });

    it("sets expiresAt to null when durationMinutes=0", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 0);
        expect(getHealingStatus().overrides.expiresAt).toBeNull();
    });

    it("sets expiresAt to a future date when durationMinutes > 0", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 30);
        const { expiresAt } = getHealingStatus().overrides;
        expect(expiresAt).not.toBeNull();
        expect(new Date(expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it("records triggers and reasoning", () => {
        const triggers = ["high_error_rate", "timeout"];
        setHealingOverrides(["reduce_tokens_25pct"], "MEDIUM", triggers, "too many errors", 10);
        const status = getHealingStatus();
        expect(status.overrides.triggers).toEqual(triggers);
        expect(status.overrides.reasoning).toBe("too many errors");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// clearHealingOverrides
// ═════════════════════════════════════════════════════════════════════════════

describe("clearHealingOverrides", () => {
    it("resets active=false and assessment=OK", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "CRITICAL", [], "crash", 60);
        clearHealingOverrides("test");
        const { active, assessment } = getHealingStatus();
        expect(active).toBe(false);
        expect(assessment).toBe("OK");
    });

    it("resets maxTokensMultiplier to 1.0", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "HIGH", [], "crash", 60);
        clearHealingOverrides("test");
        expect(getHealingStatus().overrides.maxTokensMultiplier).toBe(1.0);
    });

    it("is a no-op when no overrides are active (does not increment runCount)", () => {
        const before = getHealingStatus().runCount;
        clearHealingOverrides("noop-test");
        expect(getHealingStatus().runCount).toBe(before);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// auto-expiry via getHealingStatus
// ═════════════════════════════════════════════════════════════════════════════

describe("getHealingStatus — auto-expiry", () => {
    it("auto-clears overrides when expiresAt is in the past", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 30);

        // Manually back-date expiresAt to force expiry — confirm overrides are active before advancing time
        expect(getHealingStatus().active).toBe(true);

        // Use vi.setSystemTime to simulate time having passed
        vi.useFakeTimers();
        vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000)); // +1 hour

        const afterExpiry = getHealingStatus();
        expect(afterExpiry.active).toBe(false);

        vi.useRealTimers();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// applyHealingOverrides
// ═════════════════════════════════════════════════════════════════════════════

describe("applyHealingOverrides", () => {
    const baseConfig = {
        provider:    "openai" as const,
        model:       "gpt-4.1-mini",
        maxTokens:   4096,
        timeoutMs:   30_000,
        temperature: 0.7,
    };

    it("returns config unchanged when no active overrides", () => {
        const result = applyHealingOverrides(baseConfig);
        expect(result).toEqual(baseConfig);
    });

    it("reduces maxTokens by 25% when reduce_tokens_25pct is active", () => {
        setHealingOverrides(["reduce_tokens_25pct"], "LOW", [], "test", 60);
        const result = applyHealingOverrides(baseConfig);
        // 4096 * 0.75 = 3072, clamped to Math.floor
        expect(result.maxTokens).toBe(Math.max(256, Math.floor(4096 * 0.75)));
        clearHealingOverrides("teardown");
    });

    it("reduces maxTokens by 50% when reduce_tokens_50pct is active", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "HIGH", [], "test", 60);
        const result = applyHealingOverrides(baseConfig);
        expect(result.maxTokens).toBe(Math.max(256, Math.floor(4096 * 0.5)));
        clearHealingOverrides("teardown");
    });

    it("clamps reduced maxTokens to minimum 256", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "HIGH", [], "test", 60);
        const smallConfig = { ...baseConfig, maxTokens: 400 };
        const result = applyHealingOverrides(smallConfig);
        expect(result.maxTokens).toBeGreaterThanOrEqual(256);
        clearHealingOverrides("teardown");
    });

    it("reduces timeoutMs by 30% when enable_timeout_reduction is active", () => {
        setHealingOverrides(["enable_timeout_reduction"], "MEDIUM", [], "timeout", 60);
        const result = applyHealingOverrides(baseConfig);
        expect(result.timeoutMs).toBe(Math.max(10_000, Math.floor(30_000 * 0.7)));
        clearHealingOverrides("teardown");
    });

    it("does NOT mutate the input config", () => {
        setHealingOverrides(["reduce_tokens_50pct"], "HIGH", [], "test", 60);
        const original = { ...baseConfig };
        applyHealingOverrides(baseConfig);
        expect(baseConfig).toEqual(original);
        clearHealingOverrides("teardown");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// recordRunTimestamps
// ═════════════════════════════════════════════════════════════════════════════

describe("recordRunTimestamps", () => {
    it("updates lastRunAt and nextRunAt", () => {
        const lastRun = new Date("2026-01-01T12:00:00Z");
        recordRunTimestamps(lastRun, 30);
        const status = getHealingStatus();
        expect(status.lastRunAt).toBe("2026-01-01T12:00:00.000Z");
        expect(status.nextRunAt).toBe("2026-01-01T12:30:00.000Z");
    });
});
