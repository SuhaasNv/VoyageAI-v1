import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { extractTripFromText } from "@/services/ai/create-trip-from-text.service";
import { getTravelPreferenceContext } from "@/memory/contextStore";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";

const RefineTripAISchema = z.object({
    text: z.string().min(5).max(1000)
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, RefineTripAISchema);
        if (!body.ok) return body.response;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:refine-trip`);

            const safeText = sanitizeUserInput(body.data.text);
            const dnaContext = await getTravelPreferenceContext(auth.user.sub);
            const extracted = await extractTripFromText(safeText, dnaContext ?? undefined);
            validateLLMOutput(JSON.stringify(extracted), "json");

            return successResponse(formatAIResponse({
                destination: extracted.destination,
                startDate: extracted.startDate,
                endDate: extracted.endDate,
                budget: extracted.budget?.total,
                style: extracted.style,
                raw: safeText,
            }, {
                confidence: computeConfidence({ mode: "LLM_ONLY", usedFallback: !dnaContext }),
                reasoning:  "Trip parameters extracted from natural language via LLM for pre-creation review.",
                sources:    ["User natural language input", ...(dnaContext ? ["Travel DNA preferences"] : []), "LLM structured extraction"],
            }));
        } catch (err) {
            logError("[POST /api/ai/refine-trip] logic error", err);
            return formatErrorResponse(err);
        }
    });
}
