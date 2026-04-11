import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { ResearchAgent } from "@/agents/research/researchAgent";

const DaySchema = z.object({
    day: z.number(),
    theme: z.string(),
});

const Schema = z.object({
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    durationDays: z.number(),
    preferences: z
        .object({
            budget: z.number().optional(),
            style: z.string().optional(),
            pace: z.string().optional(),
        })
        .optional(),
    days: z.array(DaySchema),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, Schema);
        if (!body.ok) return body.response;

        const flowSessionId = req.headers.get("x-flow-session-id") ?? undefined;
        logStructured({ layer: "agent", step: "start", data: { stage: "research", flowSessionId } });

        try {
            const t0 = Date.now();
            const agent = new ResearchAgent();
            const result = await agent.run(body.data, flowSessionId);
            const durationMs = Date.now() - t0;

            const totalActivities = result.days.reduce((s, d) => s + d.activities.length, 0);

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.85,
                    dataSources: [
                        "Bright Data web search",
                        "Mapbox Geocoding",
                        "Hotel directories",
                        "Review aggregators",
                    ],
                    decisionsLog: [
                        `+0ms Starting research for ${body.data.destination}`,
                        `Found ${result.hotels.length} hotels and ${totalActivities} activities`,
                        `+${durationMs}ms Research complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
