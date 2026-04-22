import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { getLLMClient, executeWithRetry, parseJSONResponse, AIServiceError } from "@/lib/ai/llm";
import { getDestinationImage } from "@/lib/services/image.service";
import { logInfo, logError } from "@/infrastructure/logger";
import { validateLLMOutput, sanitizeUserInput } from "@/security/safety";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import {
    destinationInfoCacheKey,
    getDestinationInfoCached,
    setDestinationInfoCached,
} from "@/lib/ai/cache";
import { getRedisClient, hasRedisConfig } from "@/lib/redis";

export const runtime = "nodejs";

const DestinationInfoSchema = z.object({
    description: z.string(),
    culture: z.string(),
    history: z.string(),
    food: z.string(),
    topAttractions: z.array(z.string()),
    bestTimeToVisit: z.string(),
});

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const rawName = url.searchParams.get("name")?.trim();

        if (!rawName) {
            return NextResponse.json({ success: false, error: "Destination name is required" }, { status: 400 });
        }

        // Sanitize before any LLM embedding or use as a cache/DB key.
        const name = sanitizeUserInput(rawName.slice(0, 200));
        if (!name) {
            return NextResponse.json({ success: false, error: "Invalid destination name" }, { status: 400 });
        }

        try {
            await checkRateLimit(`ai:${auth.user.sub}:destination-info`);

            // ── HyperLogLog: track unique users per destination ───────────────
            if (hasRedisConfig()) {
                const redis = getRedisClient();
                const slug = name.toLowerCase().replace(/\s+/g, "-");
                void redis?.pfadd(`hll:dest:views:${slug}`, auth.user.sub);
            }

            // ── Redis cache check ─────────────────────────────────────────────
            const cacheKey = destinationInfoCacheKey(name);
            const cached = await getDestinationInfoCached(cacheKey);
            if (cached) {
                logInfo("[/api/ai/destination-info] cache hit", { destination: name });
                return NextResponse.json({ success: true, data: cached });
            }

            logInfo("[/api/ai/destination-info] fetching info for", { destination: name });

            const extractionPrompt = `Generate a detailed travel overview for the destination: "${name}".
Return strict JSON only. Do not include markdown formatting or extra text.
Schema:
{
  "description": "A 2-3 sentence inspiring overview of the destination.",
  "culture": "A short paragraph highlighting the local culture and vibe.",
  "history": "A short paragraph about the historical significance.",
  "food": "A short paragraph describing the local cuisine and must-try dishes.",
  "topAttractions": ["Attraction 1", "Attraction 2", "Attraction 3", "Attraction 4"],
  "bestTimeToVisit": "A short string indicating the best season/months and why."
}`;

            const client = getLLMClient();
            const llmResponse = await executeWithRetry(
                client,
                [{ role: "user", content: extractionPrompt }],
                { ...selectModelConfig({ endpoint: "destination-info" }), responseFormat: "json" as const, retries: 2 }
            );

            validateLLMOutput(llmResponse.content, "json");
            const aiData = DestinationInfoSchema.parse(
                parseJSONResponse<unknown>(llmResponse.content)
            );

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(name);
            } catch (err) {
                logError("[/api/ai/destination-info] image fetch error", err);
            }

            const result = { ...aiData, imageUrl, name };
            await setDestinationInfoCached(cacheKey, result);

            return NextResponse.json({ success: true, data: result });
        } catch (err) {
            logError("[/api/ai/destination-info] error", err);
            if (err && typeof err === "object" && "code" in err && err.code === "RATE_LIMITED") {
                return NextResponse.json(
                    { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
                    { status: 429 }
                );
            }
            if (err instanceof AIServiceError) {
                return NextResponse.json(
                    { success: false, error: { code: err.code, message: "Unable to process request. Please try again." } },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "An error occurred fetching destination info." } },
                { status: 500 }
            );
        }
    });
}
