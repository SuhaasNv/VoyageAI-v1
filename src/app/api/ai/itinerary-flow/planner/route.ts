import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { PlannerAgent } from "@/agents/planner/plannerAgent";

const Schema = z.object({
    input: z.string().min(5).max(2000),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        // Correlate this stage call with the full planning session from the UI.
        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "planner", flowSessionId } });

        try {
            const t0 = Date.now();
            const agent = new PlannerAgent();
            const result = await agent.run(body.data.input, flowSessionId);
            const durationMs = Date.now() - t0;

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    dataSources: ["Travel preferences", "Date & duration analysis", "Style heuristics"],
                    decisionsLog: [
                        `Received trip input: "${body.data.input.slice(0, 60)}..."`,
                        `Parsed destination and date range`,
                        `Inferred travel style from preferences`,
                        `Assigned themes to ${result.durationDays} days`,
                        `Blueprint complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
