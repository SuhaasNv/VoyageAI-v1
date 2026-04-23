import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { getLLMClient } from "@/lib/ai/llm";
import { logError } from "@/infrastructure/logger";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";
import { formatAIResponse } from "@/lib/ai/explainability";
import { computeConfidence } from "@/lib/ai/confidence";

// ─── Request schema ────────────────────────────────────────────────────────────

const TripIntelligenceSchema = z.object({
    nextTrip: z.object({
        destination: z.string().min(1).max(200),
        startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
        endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
    }).nullable().optional(),
    // Accept arbitrary DNA but cap the total serialised size so it cannot be
    // used to bloat the prompt or exfiltrate data via crafted payloads.
    // z.record() in Zod v4 requires TWO args: (keyType, valueType).
    // Also nullable() because the client sends dna: null before preferences load.
    dna: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/ai/trip-intelligence
 *
 * Generates AI-powered insights for the dashboard's "Brain" card.
 */
export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const validation = await validateBody(req, TripIntelligenceSchema);
        if (!validation.ok) return validation.response;

        const { nextTrip, dna } = validation.data;

        if (!nextTrip) {
            return successResponse({ insight: null });
        }

        try {
            // Sanitize all three fields that are interpolated into the prompt.
            const safeDest  = sanitizeUserInput(nextTrip.destination);
            const safeStart = sanitizeUserInput(nextTrip.startDate);
            const safeEnd   = sanitizeUserInput(nextTrip.endDate);

            // Serialize DNA but cap its size to prevent prompt bloat / injection.
            const dnaString = dna
                ? JSON.stringify(dna).slice(0, 500)
                : "Not provided";

            const prompt = `You are the VoyageAI Dashboard Intelligence engine.
Generate a concise, helpful, and "premium" travel insight for the user's upcoming trip.

DESTINATION: ${safeDest}
DATES: ${safeStart} to ${safeEnd}
USER PREFERENCES (TRAVEL DNA): ${dnaString}

The insight should be one of:
1. A cultural tip (e.g., tipping etiquette or local customs).
2. A weather-based packing reminder (based on the season for that destination).
3. A "Hidden Gem" suggestion that matches their DNA interests.
4. A proactive logistics reminder (e.g., "Check if your visa is ready").

Format: A single short paragraph (max 30 words).
Tone: Helpful, institutional, professional.
Return ONLY the insight text. No preamble.`;

            const client = getLLMClient();
            const response = await client.execute([
                { role: "system", content: "You are the VoyageAI Dashboard Intelligence engine. Respond with travel insights only." },
                { role: "user",   content: prompt },
            ], {
                temperature: 0.7,
                maxTokens:   100,
            });

            validateLLMOutput(response.content, "text");
            return successResponse(formatAIResponse(
                { insight: response.content.trim() },
                {
                    confidence: computeConfidence({ mode: "LLM_ONLY" }),
                    reasoning:  `Dashboard intelligence insight generated for ${safeDest} (${safeStart}–${safeEnd}) via LLM.`,
                    sources:    ["Trip destination & dates", ...(dna ? ["Travel DNA preferences"] : []), "LLM knowledge base"],
                },
            ));
        } catch (err) {
            logError("[AI Trip Intelligence] Failed to generate insight", err);
            return successResponse(formatAIResponse(
                { insight: "Review your itinerary and ensure your documents are ready." },
                {
                    confidence: computeConfidence({ mode: "DETERMINISTIC" }),
                    reasoning:  "LLM unavailable — static fallback insight returned.",
                    sources:    ["Static fallback"],
                },
            ));
        }
    });
}
