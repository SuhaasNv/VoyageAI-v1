import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { formatErrorResponse } from "@/lib/errors";
import { logStructured } from "@/infrastructure/logger";
import { PlannerAgent } from "@/agents/planner/plannerAgent";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";

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

            const decisionsLog = [
                `Received trip input: "${body.data.input.slice(0, 60)}..."`,
                `Parsed destination and date range`,
                `Inferred travel style from preferences`,
                `Assigned themes to ${result.durationDays} days`,
                `Blueprint complete`,
            ];

            return successResponse(
                formatAIResponse(result, {
                    // LLM parses free-text input; no external data to verify against.
                    confidence: computeConfidence({ mode: "LLM_ONLY" }),
                    reasoning: `Parsed user input into a ${result.durationDays}-day trip to ${result.destination}. ` +
                        `Travel style, pace, and budget were inferred from preferences; ` +
                        `day themes were assigned deterministically.`,
                    sources: ["User input", "Travel preferences", "Date & duration analysis", "Style heuristics"],
                    durationMs,
                    decisionsLog,
                })
            );
        } catch (err) {
            return formatErrorResponse(err);
        }
    });
}
