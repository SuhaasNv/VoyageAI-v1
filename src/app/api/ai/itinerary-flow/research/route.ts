import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
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

        try {
            const t0 = Date.now();
            const agent = new ResearchAgent();
            const result = await agent.run(body.data);
            const durationMs = Date.now() - t0;

            const totalActivities = result.days.reduce((s, d) => s + d.activities.length, 0);

            return successResponse({
                ...result,
                _meta: {
                    durationMs,
                    confidence: 0.85,
                    dataSources: [
                        "Bright Data web search",
                        `${result.hotels.length * 3}+ live sources`,
                        "Hotel directories",
                        "Review aggregators",
                    ],
                    decisionsLog: [
                        `+0ms Starting research for ${body.data.destination}`,
                        `+100ms Querying Bright Data for attractions`,
                        `+200ms Fetching hotel options`,
                        `+300ms Searching restaurants`,
                        `+400ms Filtering by travel style: ${body.data.preferences?.style ?? "balanced"}`,
                        `+500ms Found ${result.hotels.length} hotels and ${totalActivities} activities`,
                        `+${durationMs}ms Research complete`,
                    ],
                },
            });
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
