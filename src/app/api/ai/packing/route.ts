/**
 * app/api/ai/packing/route.ts
 *
 * POST /api/ai/packing
 *
 * Generates an AI-curated packing list for a trip.
 * Request body is validated against PackingListRequestSchema before the service
 * layer is invoked; invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";

import { generatePackingList } from "@/tools/packingTool";
import { PackingListRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { packingCacheKey, getPackingCached, setPackingCached } from "@/lib/ai/cache";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, PackingListRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:packing`);

        const { startDate, endDate, climate, activities, travelDNA } = validation.data;
        const destination = sanitizeUserInput(validation.data.destination);
        const cacheKey = packingCacheKey({ destination, startDate, endDate, climate, activities, travelDNA });

        const withMeta = (data: object) => formatAIResponse(data, {
            confidence: computeConfidence({ mode: "LLM_ONLY" }),
            reasoning:  `Packing list generated for ${destination} (${startDate}–${endDate}) ` +
                        `using destination, climate, and travel style via LLM.`,
            sources:    ["Trip destination & dates", "Climate preferences", "Activity types", "Travel DNA", "LLM knowledge base"],
        });

        const cached = await getPackingCached(cacheKey);
        if (cached) {
            return NextResponse.json({ success: true, data: withMeta(cached as object) }, { status: 200 });
        }

        const result = await generatePackingList({ ...validation.data, destination });
        validateLLMOutput(JSON.stringify(result), "json");
        await setPackingCached(cacheKey, result);
        return NextResponse.json({ success: true, data: withMeta(result as object) }, { status: 200 });
    } catch (err) {
        logError("[API] Packing list generation error", err);
        return formatErrorResponse(err);
    }
    });
}
