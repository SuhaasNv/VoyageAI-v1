/**
 * POST /api/ai/extract-trip-params
 *
 * Extracts trip details from natural language and returns them (with an image URL)
 * for user confirmation before creating the actual trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { unauthorizedResponse } from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { getDestinationImage } from "@/lib/services/image.service";
import { extractTripFromText } from "@/services/ai/create-trip-from-text.service";
import { CreateTripFromTextInputSchema } from "@/lib/ai/schemas";
import { getTravelPreferenceContext } from "@/memory/contextStore";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const validation = await validateBody(req, CreateTripFromTextInputSchema);
        if (!validation.ok) return validation.response;

        const safeText = sanitizeUserInput(validation.data.text);

        try {
            await checkRateLimit(`ai:${auth.user.sub}:extract-trip`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);
            const extracted = await extractTripFromText(safeText, dnaContext || undefined);
            validateLLMOutput(JSON.stringify(extracted), "json");

            const defaultStart = new Date();
            defaultStart.setDate(defaultStart.getDate() + 30);
            const defaultEnd = new Date(defaultStart);
            defaultEnd.setDate(defaultEnd.getDate() + 7);
            
            const startDate = extracted.startDate ?? defaultStart.toISOString().slice(0, 10);
            const endDate   = extracted.endDate   ?? defaultEnd.toISOString().slice(0, 10);

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(extracted.destination);
            } catch {
                imageUrl = null;
            }

            const responsePayload = {
                destination: extracted.destination,
                startDate,
                endDate,
                budget: extracted.budget,
                style: extracted.style,
                imageUrl,
            };

            return NextResponse.json({ success: true, data: formatAIResponse(responsePayload, {
                confidence: computeConfidence({ mode: imageUrl ? "LLM_GROUNDED" : "LLM_ONLY", usedFallback: !dnaContext }),
                reasoning:  `Trip parameters extracted from natural language via LLM` +
                            (dnaContext ? " with Travel DNA context." : " (no Travel DNA context)."),
                sources:    ["User natural language input", ...(dnaContext ? ["Travel DNA preferences"] : []), "LLM structured extraction"],
            }) }, { status: 200 });
        } catch (err) {
            logError("[POST /api/ai/extract-trip-params] Error", err);
            return formatErrorResponse(err);
        }
    });
}
