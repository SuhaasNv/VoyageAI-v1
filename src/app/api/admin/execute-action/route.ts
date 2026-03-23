/**
 * POST /api/admin/execute-action
 *
 * Executes a structured admin action requested by the AI assistant.
 *
 * Security:
 *   - Admin auth required (requireAdminApiAuth)
 *   - CSRF token required (enforced by middleware)
 *   - Input validated with Zod (action type whitelist + safe payload)
 *
 * Every execution is logged to AdminActionLog (fire-and-forget in the service).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin";
import { executeAdminAction, ActionTypeSchema } from "@/services/admin/actionExecutor";
import { successResponse, errorResponse, internalErrorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";

// ─── Validation ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
    action: z.object({
        type:    ActionTypeSchema,
        payload: z.record(z.string(), z.unknown()).optional(),
    }),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        let body: z.infer<typeof BodySchema>;
        try {
            const raw    = await req.json();
            const parsed = BodySchema.safeParse(raw);
            if (!parsed.success) {
                return errorResponse("INVALID_INPUT", "Invalid action payload", 400);
            }
            body = parsed.data;
        } catch {
            return errorResponse("INVALID_INPUT", "Invalid JSON body", 400);
        }

        try {
            const result = await executeAdminAction(body.action, auth.auth.user.sub);
            return successResponse(result);
        } catch (err) {
            logError("[execute-action] Unhandled error", err);
            return internalErrorResponse("Action execution failed");
        }
    });
}
