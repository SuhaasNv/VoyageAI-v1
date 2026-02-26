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

import { generatePackingList } from "@/services/ai/packing.service";
import { PackingListRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, PackingListRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:packing`);
        const result = await generatePackingList(validation.data);
        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (err) {
        console.error("[API] Packing list generation error", err);
        return formatErrorResponse(err);
    }
    });
}
