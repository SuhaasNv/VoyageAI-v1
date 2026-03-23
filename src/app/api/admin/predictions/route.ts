/**
 * GET /api/admin/predictions
 *
 * Returns the latest predictive intelligence report.
 * Results are cached for 5 minutes in the service layer.
 *
 * Query params:
 *   ?refresh=1   — bypass cache and recompute (admin panel "Refresh" button)
 *
 * Security: requireAdminApiAuth enforced before any computation.
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth }  from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { internalErrorResponse } from "@/lib/api/response";
import { logError }              from "@/infrastructure/logger";
import { getPredictions }        from "@/services/ai/predictive.service";

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

        try {
            const report = await getPredictions(forceRefresh);
            return Response.json({ success: true, data: report });
        } catch (err) {
            logError("[GET /api/admin/predictions] failed", err);
            return internalErrorResponse("Predictive analysis unavailable — check server logs.");
        }
    });
}
