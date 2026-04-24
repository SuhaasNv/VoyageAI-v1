/**
 * tests/lib/response.test.ts
 *
 * Tests for:
 *   - lib/api/response.ts  (successResponse, errorResponse, validationErrorResponse,
 *                           unauthorizedResponse, forbiddenResponse, rateLimitResponse,
 *                           internalErrorResponse)
 *   - lib/errors.ts        (formatErrorResponse, AppError)
 *
 * We mock @/lib/requestContext so getRequestId returns a deterministic value,
 * and mock @/security/rateLimiter + @/lib/ai/* so those classes work in test env.
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/requestContext", () => ({
    getRequestId:       vi.fn().mockReturnValue("req-test-123"),
    getRequestPathname: vi.fn().mockReturnValue("/test"),
    runWithRequestContext: vi.fn(),
}));

vi.mock("@/security/rateLimiter", () => ({
    RateLimitError: class RateLimitError extends Error {
        readonly status = 429;
        readonly code   = "RATE_LIMIT_EXCEEDED";
        constructor(message = "rate limited") { super(message); this.name = "RateLimitError"; }
    },
}));

vi.mock("@/lib/ai/itineraryValidation", () => ({
    ItineraryValidationError: class ItineraryValidationError extends Error {
        readonly code = "ITINERARY_INVALID";
        constructor(message = "invalid itinerary") { super(message); this.name = "ItineraryValidationError"; }
    },
}));

vi.mock("@/lib/ai/llm", () => ({
    AIServiceError: class AIServiceError extends Error {
        constructor(public readonly code: string, message: string) {
            super(message);
            this.name = "AIServiceError";
        }
    },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    unauthorizedResponse,
    forbiddenResponse,
    rateLimitResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { formatErrorResponse, AppError } from "@/lib/errors";

// ─────────────────────────────────────────────────────────────────────────────
// successResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("successResponse", () => {
    it("returns status 200 by default", async () => {
        const res  = successResponse({ foo: "bar" });
        expect(res.status).toBe(200);
    });

    it("body has success:true and data wrapping", async () => {
        const res  = successResponse({ id: 1 });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ id: 1 });
    });

    it("accepts a custom status code", async () => {
        const res = successResponse({}, 201);
        expect(res.status).toBe(201);
    });

    it("accepts custom headers", async () => {
        const res = successResponse({}, 200, { "x-custom": "value" });
        expect(res.headers.get("x-custom")).toBe("value");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// errorResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("errorResponse", () => {
    it("returns status 400 by default", async () => {
        const res = errorResponse("MY_CODE", "something went wrong");
        expect(res.status).toBe(400);
    });

    it("body has success:false and error.code", async () => {
        const res  = errorResponse("MY_CODE", "something went wrong");
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("MY_CODE");
        expect(body.error.message).toBe("something went wrong");
    });

    it("accepts custom status code", async () => {
        const res = errorResponse("CONFLICT", "duplicate", 409);
        expect(res.status).toBe(409);
    });

    it("accepts details", async () => {
        const res  = errorResponse("BAD_INPUT", "bad", 400, { field: "email" });
        const body = await res.json();
        expect(body.error.details).toEqual({ field: "email" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// validationErrorResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("validationErrorResponse", () => {
    it("returns status 422 for a ZodError", async () => {
        const zodError = z.object({ name: z.string() }).safeParse({ name: 123 });
        if (zodError.success) throw new Error("expected ZodError");

        const res = validationErrorResponse(zodError.error);
        expect(res.status).toBe(422);
    });

    it("body has code VALIDATION_ERROR", async () => {
        const zodError = z.object({ email: z.string().email() }).safeParse({ email: "bad" });
        if (zodError.success) throw new Error("expected ZodError");

        const res  = validationErrorResponse(zodError.error);
        const body = await res.json();
        expect(body.error.code).toBe("VALIDATION_ERROR");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// unauthorizedResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("unauthorizedResponse", () => {
    it("returns 401 status", async () => {
        const res = unauthorizedResponse();
        expect(res.status).toBe(401);
    });

    it("body has code UNAUTHORIZED", async () => {
        const res  = unauthorizedResponse();
        const body = await res.json();
        expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("accepts custom message", async () => {
        const res  = unauthorizedResponse("Token expired");
        const body = await res.json();
        expect(body.error.message).toBe("Token expired");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// forbiddenResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("forbiddenResponse", () => {
    it("returns 403 status", async () => {
        const res = forbiddenResponse();
        expect(res.status).toBe(403);
    });

    it("body has code FORBIDDEN", async () => {
        const res  = forbiddenResponse();
        const body = await res.json();
        expect(body.error.code).toBe("FORBIDDEN");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// rateLimitResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("rateLimitResponse", () => {
    it("returns 429 status", async () => {
        const res = rateLimitResponse(5000);
        expect(res.status).toBe(429);
    });

    it("sets Retry-After header in seconds", async () => {
        const res = rateLimitResponse(5000); // 5 seconds
        expect(res.headers.get("Retry-After")).toBe("5");
    });

    it("rounds up Retry-After to nearest second", async () => {
        const res = rateLimitResponse(5500); // 5.5 s → ceil → 6
        expect(res.headers.get("Retry-After")).toBe("6");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// internalErrorResponse
// ─────────────────────────────────────────────────────────────────────────────

describe("internalErrorResponse", () => {
    it("returns 500 status", async () => {
        const res = internalErrorResponse();
        expect(res.status).toBe(500);
    });

    it("body has code INTERNAL_ERROR", async () => {
        const res  = internalErrorResponse();
        const body = await res.json();
        expect(body.error.code).toBe("INTERNAL_ERROR");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatErrorResponse — error type routing
// ─────────────────────────────────────────────────────────────────────────────

describe("formatErrorResponse — error type routing", () => {
    it("returns 401 for AppError with statusCode 401", async () => {
        const err = new AppError("Unauthorized", 401, "UNAUTHORIZED");
        const res = formatErrorResponse(err);
        expect(res.status).toBe(401);
    });

    it("returns 422 for ZodError", async () => {
        const zodResult = z.object({ x: z.number() }).safeParse({ x: "bad" });
        if (zodResult.success) throw new Error("expected ZodError");
        const res = formatErrorResponse(zodResult.error);
        expect(res.status).toBe(422);
    });

    it("returns 429 for RateLimitError", async () => {
        const { RateLimitError } = await import("@/security/rateLimiter");
        const res = formatErrorResponse(new RateLimitError("ai:user:plan", 30, 60));
        expect(res.status).toBe(429);
    });

    it("returns 422 for ItineraryValidationError", async () => {
        const { ItineraryValidationError } = await import("@/lib/ai/itineraryValidation");
        const res = formatErrorResponse(new ItineraryValidationError("bad itinerary", "STRUCTURE_INVALID"));
        expect(res.status).toBe(422);
    });

    it("returns 503 for AIServiceError with LLM_ERROR code", async () => {
        const { AIServiceError } = await import("@/lib/ai/llm");
        const res = formatErrorResponse(new AIServiceError("LLM_ERROR", "LLM unavailable"));
        expect(res.status).toBe(503);
    });

    it("returns 400 for AIServiceError with SCHEMA_VALIDATION_FAILED code", async () => {
        const { AIServiceError } = await import("@/lib/ai/llm");
        const res = formatErrorResponse(new AIServiceError("SCHEMA_VALIDATION_FAILED", "bad schema"));
        expect(res.status).toBe(400);
    });

    it("returns 500 for an unknown Error", async () => {
        const res = formatErrorResponse(new Error("something unexpected"));
        expect(res.status).toBe(500);
    });

    it("returns 500 for a non-Error throw (string)", async () => {
        const res = formatErrorResponse("some string error");
        expect(res.status).toBe(500);
    });

    it("sets X-Request-ID header when requestId is available", async () => {
        const err = new AppError("test", 400, "TEST");
        const res = formatErrorResponse(err);
        expect(res.headers.get("X-Request-ID")).toBe("req-test-123");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AppError
// ─────────────────────────────────────────────────────────────────────────────

describe("AppError", () => {
    it("is an instance of Error", () => {
        expect(new AppError("msg") instanceof Error).toBe(true);
    });

    it("has correct name", () => {
        expect(new AppError("msg").name).toBe("AppError");
    });

    it("defaults statusCode to 500", () => {
        expect(new AppError("msg").statusCode).toBe(500);
    });

    it("defaults code to INTERNAL_ERROR", () => {
        expect(new AppError("msg").code).toBe("INTERNAL_ERROR");
    });

    it("accepts custom statusCode and code", () => {
        const err = new AppError("Not found", 404, "NOT_FOUND");
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe("NOT_FOUND");
    });

    it("accepts details", () => {
        const err = new AppError("Bad", 400, "BAD", { field: "name" });
        expect(err.details).toEqual({ field: "name" });
    });
});
