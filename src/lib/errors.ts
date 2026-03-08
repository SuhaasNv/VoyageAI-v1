import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestId } from "@/lib/requestContext";
import { RateLimitError } from "@/security/rateLimiter";
import { ItineraryValidationError } from "@/lib/ai/itineraryValidation";
import { AIServiceError } from "@/lib/ai/llm";

export interface ApiErrorBody {
    success: false;
    error: { code: string; message: string; details?: unknown; requestId?: string };
}

export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number = 500,
        public readonly code: string = "INTERNAL_ERROR",
        public readonly details?: unknown
    ) {
        super(message);
        this.name = "AppError";
    }
}

function withRequestId(error: Record<string, unknown>): Record<string, unknown> {
    const requestId = getRequestId();
    if (requestId) error.requestId = requestId;
    return error;
}

function addRequestIdHeader(res: NextResponse, requestId: string | null): void {
    if (requestId) res.headers.set("X-Request-ID", requestId);
}

export function formatErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
    const requestId = getRequestId();
    if (error instanceof AppError) {
        const body: ApiErrorBody = {
            success: false,
            error: withRequestId({ code: error.code, message: error.message, details: error.details }) as ApiErrorBody["error"],
        };
        const res = NextResponse.json(body, { status: error.statusCode });
        addRequestIdHeader(res, requestId);
        return res as NextResponse<ApiErrorBody>;
    }
    if (error instanceof ZodError) {
        const body: ApiErrorBody = {
            success: false,
            error: withRequestId({
                code: "VALIDATION_ERROR",
                message: "Invalid request data",
                details: error.flatten().fieldErrors,
            }) as ApiErrorBody["error"],
        };
        const res = NextResponse.json(body, { status: 422 });
        addRequestIdHeader(res, requestId);
        return res as NextResponse<ApiErrorBody>;
    }
    if (error instanceof RateLimitError) {
        const body: ApiErrorBody = {
            success: false,
            error: withRequestId({ code: error.code, message: error.message }) as ApiErrorBody["error"],
        };
        const res = NextResponse.json(body, { status: 429 });
        addRequestIdHeader(res, requestId);
        return res as NextResponse<ApiErrorBody>;
    }
    if (error instanceof ItineraryValidationError) {
        const body: ApiErrorBody = {
            success: false,
            error: withRequestId({ code: error.code, message: error.message }) as ApiErrorBody["error"],
        };
        const res = NextResponse.json(body, { status: 422 });
        addRequestIdHeader(res, requestId);
        return res as NextResponse<ApiErrorBody>;
    }
    if (error instanceof AIServiceError) {
        const status =
            error.code === "RATE_LIMIT_EXCEEDED"
                ? 429
                : error.code === "INVALID_INPUT" || error.code === "SCHEMA_VALIDATION_FAILED"
                    ? 400
                    : error.code === "LLM_ERROR"
                        ? 503
                        : 500;
        const body: ApiErrorBody = {
            success: false,
            error: withRequestId({ code: error.code, message: error.message, details: error.details }) as ApiErrorBody["error"],
        };
        const res = NextResponse.json(body, { status });
        addRequestIdHeader(res, requestId);
        return res as NextResponse<ApiErrorBody>;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    const isProd = process.env.NODE_ENV === "production";
    const body: ApiErrorBody = {
        success: false,
        error: withRequestId({
            code: "INTERNAL_ERROR",
            message: isProd ? "An internal server error occurred" : err.message,
            details: isProd ? undefined : (err as Error & { stack?: string }).stack,
        }) as ApiErrorBody["error"],
    };
    const res = NextResponse.json(body, { status: 500 });
    addRequestIdHeader(res, requestId);
    return res as NextResponse<ApiErrorBody>;
}
