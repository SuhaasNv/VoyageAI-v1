/**
 * app/api/ai/itinerary/route.ts
 *
 * POST /api/ai/itinerary
 *
 * Generates a full day-by-day itinerary using the AI service layer.
 * Request body is validated against GenerateItineraryRequestSchema before
 * the service layer is invoked; invalid inputs return 422 with field-level
 * error details.
 */

import { NextRequest, NextResponse } from "next/server";

import { generateItinerary } from "@/services/ai/itinerary.service";
import { GenerateItineraryRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, GenerateItineraryRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:itinerary`);
        const result = await generateItinerary(validation.data);
        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (err) {
        console.error("[API] Itinerary generation error", err);
        return formatErrorResponse(err);
    }
    });
}
