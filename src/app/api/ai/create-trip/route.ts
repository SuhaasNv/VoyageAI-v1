import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { getTravelPreferenceContext } from "@/lib/ai/contextStore";

const CreateTripAIChema = z.object({
    text: z.string().min(5).max(1000)
});



const ExtractedTripSchema = z.object({
    destination: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    budget: z.coerce.number().nullable().optional(),
    vibe: z.string().nullable().optional()
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, CreateTripAIChema);
        if (!body.ok) return body.response;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            const dnaContext = await getTravelPreferenceContext(auth.user.sub);

            const prompt = `Extract structured travel data from this text. Return strict JSON only.
Assume the current year is ${new Date().getFullYear()} if the year is not specified.
${dnaContext ? `\n${dnaContext}\n` : ""}
Schema:
{
  "destination": "string",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "budget": "number (optional, null if not provided)",
  "vibe": "string enum (relaxed | exciting | creative | luxury | adventure | mixed) (null if not provided)"
}
Text: ${body.data.text}`;

            const client = getLLMClient();
            const llmResponse = await executeWithRetry(client, [{ role: "user", content: prompt }], {
                temperature: 0.1,
                responseFormat: "json",
                maxTokens: 300,
                timeoutMs: 10000,
                retries: 2,
            });

            const parsed = parseJSONResponse<unknown>(llmResponse.content);
            const extracted = ExtractedTripSchema.parse(parsed);

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(extracted.destination);
            } catch {
                imageUrl = null;
            }

            const trip = await prisma.trip.create({
                data: {
                    userId: auth.user.sub,
                    destination: extracted.destination,
                    startDate: new Date(extracted.startDate),
                    endDate: new Date(extracted.endDate),
                    budgetTotal: extracted.budget || 0,
                    style: extracted.vibe || undefined,
                    imageUrl: imageUrl || undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip), 201);
        } catch (err) {
            logError("[POST /api/ai/create-trip] logic error", err);
            return formatErrorResponse(err);
        }
    });
}
