import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { ResearchAgent } from "@/agents/research/researchAgent";
import { formatAIResponse } from "@/lib/ai/explainability";

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
    _feedback: z.string().optional(),
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
            const { _feedback, ...tripContext } = body.data;
            const result = await agent.run(tripContext, flowSessionId, _feedback);
            const durationMs = Date.now() - t0;

            const totalActivitiesCount = result.days.reduce((s, d) => s + d.activities.length, 0);
            const usedBrightData = result._dataSource === "brightdata";

            const sources = [
                usedBrightData ? "Bright Data web search" : "LLM knowledge base (unverified)",
                "Mapbox Geocoding API",
            ];

            const decisionsLog = [
                `Starting research for ${body.data.destination}`,
                `Found ${result.hotels.length} hotels and ${totalActivitiesCount} activities`,
                `Research complete`,
            ];

            return successResponse(
                formatAIResponse(
                    { ...result, groundedActivitiesCount: usedBrightData ? totalActivitiesCount : 0, totalActivitiesCount },
                    {
                        confidence: usedBrightData ? 0.95 : 0.72,
                        reasoning: `Researched ${body.data.destination}: found ${result.hotels.length} hotel option(s) and ` +
                            `${totalActivitiesCount} activities across ${result.days.length} days. ` +
                            `Data source: ${usedBrightData ? "Bright Data web search (real-world verified)" : "LLM knowledge base (unverified — Bright Data unavailable)"}.`,
                        sources,
                        durationMs,
                        decisionsLog,
                    }
                )
            );
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
