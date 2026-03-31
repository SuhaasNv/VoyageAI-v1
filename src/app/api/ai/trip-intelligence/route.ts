import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/api/request";
import { successResponse, unauthorizedResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";
import { getLLMClient } from "@/lib/ai/llm";
import { logError } from "@/infrastructure/logger";

/**
 * GET /api/ai/trip-intelligence
 * 
 * Generates truly dynamic, AI-powered insights for the dashboard's "Brain" card.
 */
export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        try {
            const { nextTrip, dna } = await req.json();

            if (!nextTrip) {
                return successResponse({ insight: null });
            }

            const prompt = `
                You are the VoyageAI Dashboard Intelligence engine. 
                Generate a concise, helpful, and "premium" travel insight for the user's upcoming trip.

                DESTINATION: ${nextTrip.destination}
                DATES: ${nextTrip.startDate} to ${nextTrip.endDate}
                USER PREFERENCES (TRAVEL DNA): ${JSON.stringify(dna)}

                The insight should be one of:
                1. A cultural tip (e.g., tipping etiquette or local customs).
                2. A weather-based packing reminder (based on the season for that destination).
                3. A "Hidden Gem" suggestion that matches their DNA interests.
                4. A proactive logistics reminder (e.g., "Check if your visa is ready").

                Format: A single short paragraph (max 30 words). 
                Tone: Helpful, institutional, professional.
            `;

            const client = getLLMClient();
            const response = await client.execute([
                { role: "system", content: "You are the VoyageAI Dashboard Intelligence engine." },
                { role: "user", content: prompt }
            ], {
                temperature: 0.7,
                maxTokens: 100
            });

            return successResponse({ insight: response.content.trim() });
        } catch (err) {
            logError("[AI Trip Intelligence] Failed to generate insight", err);
            return successResponse({ insight: "Review your itinerary and ensure your documents are ready." }); // Fallback
        }
    });
}
