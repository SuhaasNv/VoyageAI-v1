/**
 * /api/admin/autonomous
 *
 * GET  — returns current autonomous runner status (mode, isRunning, lastResult)
 * POST — triggers one autonomous cycle immediately
 *
 * Security: requireAdminApiAuth on all methods.
 * CSRF:     POST enforced by global middleware (requires X-CSRF-Token header).
 *
 * The runner respects AUTONOMY_MODE env var:
 *   OFF  (default) → cycles are a no-op with a clear skippedReason
 *   SAFE → runs checks + cache clears only
 *   FULL → full action set including model-level overrides
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth }  from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { internalErrorResponse } from "@/lib/api/response";
import { logError }              from "@/infrastructure/logger";
import { getRunnerStatus, runAutonomousCycle } from "@/services/ai/autonomousRunner";

// ─── GET — status ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        return Response.json({ success: true, data: getRunnerStatus() });
    });
}

// ─── POST — trigger cycle ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        try {
            const result = await runAutonomousCycle();
            return Response.json({ success: true, data: result });
        } catch (err) {
            logError("[POST /api/admin/autonomous] cycle threw", err);
            return internalErrorResponse("Autonomous cycle failed — check server logs.");
        }
    });
}
