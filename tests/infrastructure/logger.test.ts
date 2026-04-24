/**
 * tests/infrastructure/logger.test.ts
 *
 * Unit tests for src/infrastructure/logger.ts:
 *   - generateRequestId
 *   - trunc
 *   - logInfo, logError, logDebug, logStructured (smoke tests + branch coverage)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
    generateRequestId,
    trunc,
    logInfo,
    logError,
    logDebug,
    logStructured,
} from "@/infrastructure/logger";

// ═════════════════════════════════════════════════════════════════════════════
// generateRequestId
// ═════════════════════════════════════════════════════════════════════════════

describe("generateRequestId", () => {
    it("returns a non-empty string", () => {
        const id = generateRequestId();
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
    });

    it("returns unique values on each call", () => {
        const ids = new Set(Array.from({ length: 10 }, () => generateRequestId()));
        expect(ids.size).toBe(10);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// trunc
// ═════════════════════════════════════════════════════════════════════════════

describe("trunc", () => {
    it("returns string unchanged when shorter than max", () => {
        expect(trunc("short", 200)).toBe("short");
    });

    it("truncates to max chars and appends '…'", () => {
        const long   = "a".repeat(205);
        const result = trunc(long, 200);
        expect(result).toHaveLength(201); // 200 + "…"
        expect(result.endsWith("…")).toBe(true);
    });

    it("uses default max of 200", () => {
        const long   = "x".repeat(201);
        const result = trunc(long);
        expect(result.endsWith("…")).toBe(true);
    });

    it("returns string unchanged when exactly at max", () => {
        const exact = "e".repeat(200);
        expect(trunc(exact)).toBe(exact);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// logInfo — development mode (smoke tests, covers non-production branch)
// ═════════════════════════════════════════════════════════════════════════════

describe("logInfo — development mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    afterEach(() => spy.mockClear());

    it("calls console.log with message", () => {
        logInfo("Test message");
        expect(spy).toHaveBeenCalled();
    });

    it("includes meta when provided", () => {
        logInfo("Test with meta", { key: "value" });
        expect(spy).toHaveBeenCalledWith("Test with meta", { key: "value" });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// logError — development mode
// ═════════════════════════════════════════════════════════════════════════════

describe("logError — development mode", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    afterEach(() => spy.mockClear());

    it("calls console.error with message", () => {
        logError("Error occurred");
        expect(spy).toHaveBeenCalled();
    });

    it("includes meta when provided", () => {
        logError("Error with meta", { code: 500 });
        expect(spy).toHaveBeenCalledWith("Error with meta", { code: 500 });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// logDebug — development mode
// ═════════════════════════════════════════════════════════════════════════════

describe("logDebug — development mode", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    afterEach(() => spy.mockClear());

    it("calls console.debug in non-production", () => {
        logDebug("Debug message");
        expect(spy).toHaveBeenCalled();
    });

    it("includes meta in debug output", () => {
        logDebug("Debug with meta", { val: 42 });
        expect(spy).toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// logStructured — development mode
// ═════════════════════════════════════════════════════════════════════════════

describe("logStructured — development mode", () => {
    const logSpy  = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy  = vi.spyOn(console, "error").mockImplementation(() => {});

    afterEach(() => {
        logSpy.mockClear();
        errSpy.mockClear();
    });

    it("logs an agent-level entry with step=start", () => {
        logStructured({ layer: "agent", agent: "planner", step: "start" });
        expect(logSpy).toHaveBeenCalled();
    });

    it("uses console.error for step=error", () => {
        logStructured({ layer: "agent", agent: "planner", step: "error" });
        expect(errSpy).toHaveBeenCalled();
    });

    it("includes requestId and data in output", () => {
        logStructured({
            layer:     "llm",
            step:      "llm-call",
            requestId: "req-123",
            data:      { model: "gpt-4" },
        });
        expect(logSpy).toHaveBeenCalled();
    });

    it("handles entry with no data and no requestId", () => {
        logStructured({ layer: "service", service: "mapbox", step: "cache_hit" });
        expect(logSpy).toHaveBeenCalled();
    });

    it("includes agent tag when agent is specified", () => {
        logStructured({ layer: "agent", agent: "research", step: "output" });
        const callArgs = logSpy.mock.calls[0]?.[0] as string;
        expect(callArgs).toContain("[agent:research]");
        expect(callArgs).toContain("output");
    });
});
