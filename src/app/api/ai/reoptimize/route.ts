/**
 * app/api/ai/reoptimize/route.ts
 *
 * POST /api/ai/reoptimize
 *
 * Reoptimizes an existing itinerary based on real-time constraints.
 * Request body is validated against ReoptimizeRequestSchema before the service
 * layer is invoked; invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";

import { reoptimizeTrip } from "@/services/ai/reoptimize.service";
import { ReoptimizeRequestSchema } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
    const validation = await validateBody(req, ReoptimizeRequestSchema);
    if (!validation.ok) return validation.response;

    const auth = getAuthContext(req);
    if (!auth) return unauthorizedResponse("Authentication required");

    try {
        await checkRateLimit(`ai:${auth.user.sub}:reoptimize`);
        const result = await reoptimizeTrip(validation.data);
        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (err) {
        console.error("[API] Reoptimize error", err);
        return formatErrorResponse(err);
    }
    });
}
