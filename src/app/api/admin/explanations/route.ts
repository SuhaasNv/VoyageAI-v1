/**
 * GET /api/admin/explanations
 *
 * Returns recent AI decision explanation logs.
 *
 * Query params:
 *   ?type=ASSISTANT_RESPONSE|AUTO_HEAL|AUTONOMOUS_ACTION|OPTIMIZATION
 *   ?limit=50  (default 100, max 200)
 *
 * Security: requireAdminApiAuth enforced first.
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth }  from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { internalErrorResponse } from "@/lib/api/response";
import { logError }              from "@/infrastructure/logger";
import {
    getRecentDecisions,
    type DecisionType,
} from "@/services/ai/explanation.service";

const VALID_TYPES = new Set<DecisionType>([
    "ASSISTANT_RESPONSE", "AUTO_HEAL", "AUTONOMOUS_ACTION", "OPTIMIZATION",
]);

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        const params = req.nextUrl.searchParams;
        const rawType = params.get("type") ?? "";
        const type = VALID_TYPES.has(rawType as DecisionType) ? (rawType as DecisionType) : undefined;
        const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? "100", 10)));

        try {
            const decisions = await getRecentDecisions(limit, type);
            return Response.json({ success: true, data: decisions });
        } catch (err) {
            logError("[GET /api/admin/explanations] failed", err);
            return internalErrorResponse("Could not fetch explanation logs.");
        }
    });
}
