/**
 * /api/admin/auto-heal
 *
 * GET  — returns current healing status (anomalies, active overrides, history)
 * POST — triggers one immediate healing cycle and returns the result
 *
 * Security: requireAdminApiAuth on all methods.
 * CSRF:     POST enforced by global middleware (requires X-CSRF-Token header).
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { getHealingStatus, clearHealingOverrides } from "@/services/ai/healingStore";
import { runAutoHealCycle } from "@/services/ai/autoHealing.service";
import { internalErrorResponse } from "@/lib/api/response";
import { logError } from "@/infrastructure/logger";
import { z } from "zod";

// ─── GET — current status ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        const status = getHealingStatus();
        return Response.json({ success: true, data: status });
    });
}

// ─── POST — trigger a cycle or clear overrides ────────────────────────────────

const PostBodySchema = z.object({
    action: z.enum(["run", "clear"]).default("run"),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        let action: "run" | "clear" = "run";
        try {
            const body   = await req.json().catch(() => ({}));
            const parsed = PostBodySchema.safeParse(body);
            if (parsed.success) action = parsed.data.action;
        } catch {
            /* default to "run" if body is empty / invalid */
        }

        try {
            if (action === "clear") {
                clearHealingOverrides("admin-manual");
                return Response.json({ success: true, data: { cleared: true, status: getHealingStatus() } });
            }

            // action === "run"
            const result = await runAutoHealCycle();
            return Response.json({ success: true, data: result });
        } catch (err) {
            logError("[POST /api/admin/auto-heal] cycle failed", err);
            return internalErrorResponse("Auto-heal cycle failed — check server logs.");
        }
    });
}
