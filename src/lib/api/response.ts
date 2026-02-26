/**
 * lib/api/response.ts
 *
 * Standardized JSON response helpers for Next.js API routes.
 * Every response uses the same envelope so clients can rely on a consistent shape.
 *
 * Success: { success: true,  data: T }
 * Error:   { success: false, error: { code: string, message: string, details?: unknown } }
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, formatErrorResponse, type ApiErrorBody } from "@/lib/errors";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiSuccess<T> {
    success: true;
    data: T;
}

export type ApiError = ApiErrorBody;
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function successResponse<T>(
    data: T,
    status = 200,
    headers?: HeadersInit
): NextResponse<ApiSuccess<T>> {
    return NextResponse.json({ success: true, data }, { status, headers });
}

export function errorResponse(
    code: string,
    message: string,
    status = 400,
    details?: unknown,
    headers?: HeadersInit
): NextResponse<ApiError> {
    const res = formatErrorResponse(new AppError(message, status, code, details));
    if (headers) {
        new Headers(headers).forEach((v, k) => res.headers.set(k, v));
    }
    return res;
}

export function validationErrorResponse(err: ZodError): NextResponse<ApiError> {
    return formatErrorResponse(err);
}

export function unauthorizedResponse(
    message = "Authentication required"
): NextResponse<ApiError> {
    return formatErrorResponse(new AppError(message, 401, "UNAUTHORIZED"));
}

export function forbiddenResponse(
    message = "You do not have permission to perform this action"
): NextResponse<ApiError> {
    return formatErrorResponse(new AppError(message, 403, "FORBIDDEN"));
}

export function rateLimitResponse(retryAfterMs: number): NextResponse<ApiError> {
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    const res = formatErrorResponse(
        new AppError(
            `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
            429,
            "RATE_LIMITED"
        )
    );
    res.headers.set("Retry-After", String(retryAfterSeconds));
    return res;
}

export function internalErrorResponse(
    message = "An internal server error occurred"
): NextResponse<ApiError> {
    return formatErrorResponse(new AppError(message, 500, "INTERNAL_ERROR"));
}
