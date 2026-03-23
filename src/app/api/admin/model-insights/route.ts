/**
 * GET /api/admin/model-insights
 *
 * Returns per-(task × model) performance data from the ModelSelector's
 * stats cache: avg cost, avg latency, error rate, composite scores, and
 * which model is currently selected for each priority.
 *
 * Query params:
 *   ?task=chat|itinerary|analysis   (optional — omit for all tasks)
 *
 * Security: requireAdminApiAuth.
 */

import { NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin";
import { runWithRequestContext } from "@/lib/requestContext";
import { getModelInsights } from "@/lib/ai/modelSelector";
import { internalErrorResponse } from "@/lib/api/response";
import { logError } from "@/infrastructure/logger";
import type { Task } from "@/lib/ai/modelSelector";

const VALID_TASKS = new Set<Task>(["chat", "itinerary", "analysis"]);

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = requireAdminApiAuth(req);
        if (!auth.ok) return auth.response;

        const rawTask = req.nextUrl.searchParams.get("task");
        const task: Task | undefined =
            rawTask && VALID_TASKS.has(rawTask as Task) ? (rawTask as Task) : undefined;

        try {
            const insights = await getModelInsights(task);
            return Response.json({ success: true, data: insights });
        } catch (err) {
            logError("[GET /api/admin/model-insights] failed", err);
            return internalErrorResponse("Failed to fetch model insights.");
        }
    });
}
