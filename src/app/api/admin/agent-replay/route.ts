/**
 * GET /api/admin/agent-replay?requestId=<id>
 *
 * Returns the full structured replay trace for one orchestrator pipeline run:
 *   - steps[]     : AgentExecutionLog rows (agent name, input, output, latency, success)
 *   - llmCalls[]  : AiUsageLog rows for the same requestId (tokens, cost, model)
 *   - summary     : aggregate totals + success/failure
 *
 * Security: requireAdminApiAuth.
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { getReplayTrace } from "@/services/ai/agentReplayLogger";
import { errorResponse, internalErrorResponse } from "@/lib/api/response";
import { logError } from "@/infrastructure/logger";

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        const requestId = req.nextUrl.searchParams.get("requestId");
        if (!requestId?.trim()) {
            return errorResponse("INVALID_INPUT", "requestId query param is required");
        }

        try {
            const trace = await getReplayTrace(requestId.trim());
            if (!trace) {
                return errorResponse("NOT_FOUND", `No replay data found for requestId: ${requestId}`, 404);
            }
            return Response.json({ success: true, data: trace });
        } catch (err) {
            logError("[GET /api/admin/agent-replay] failed", err);
            return internalErrorResponse("Failed to fetch replay trace.");
        }
    });
}
