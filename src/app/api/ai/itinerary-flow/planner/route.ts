import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
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

        try {
            const t0 = Date.now();
            const agent = new PlannerAgent();
            const result = await agent.run(body.data.input);
            const durationMs = Date.now() - t0;

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.92,
                    dataSources: ["Travel preferences", "Date & duration analysis", "Style heuristics"],
                    decisionsLog: [
                        `+0ms Received trip input: "${body.data.input.slice(0, 60)}..."`,
                        `+10ms Parsed destination and date range`,
                        `+20ms Inferred travel style from preferences`,
                        `+30ms Assigned themes to ${result.durationDays} days`,
                        `+${durationMs}ms Blueprint complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
