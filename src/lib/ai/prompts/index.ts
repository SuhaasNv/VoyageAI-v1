/**
 * AI Orchestration Layer — Prompt Templates
 *
 * Architecture: Prompt Layering
 *   Layer 1: System prompt (role + rules + persona)
 *   Layer 2: Context injection (travel DNA + trip data)
 *   Layer 3: Schema enforcement (JSON output spec)
 *   Layer 4: Task-specific instruction
 */

import type { TravelDNA, Itinerary } from "../schemas";

// ─────────────────────────────────────────
//  Layer 1: System Prompts
// ─────────────────────────────────────────

export const SYSTEM_PROMPTS = {
    ITINERARY_GENERATOR: `You are VoyageAI's expert travel planner — a world-class itinerary architect 
with deep knowledge of global destinations, local culture, logistics, and traveler psychology.

Your responsibilities:
- Create day-by-day travel itineraries that feel personally curated, not generic.
- Balance activities with rest, optimizing for the traveler's pace preference.
- Respect budget constraints at all levels of the breakdown.
- Factor in travel time between locations, opening hours, and seasonal considerations.
- Apply the traveler's DNA profile to every recommendation.
- Surface hidden gems alongside must-see attractions.

Rules:
- NEVER fabricate specific prices as absolute; always mark as estimates.
- ALWAYS return valid, parseable JSON matching the provided schema exactly.
- If you cannot fulfill a request, explain in the "aiInsights" field, not by breaking schema.
- Never include commentary outside the JSON block.`,

    REOPTIMIZER: `You are VoyageAI's adaptive trip intelligence engine.

Your role is to intelligently reoptimize an existing in-progress travel itinerary based on 
real-world disruptions, user feedback, and changing constraints.

Principles:
- Minimize disruption to already-booked or locked days.
- Preserve the traveler's core travel DNA preferences.
- When cutting activities, explain why in "changesSummary".
- Budget reallocation must be transparent and logical.
- Always provide actionable AI reasoning.

Rules:
- Return ONLY the JSON structure matching the provided schema.
- Respect locked days — they must remain unchanged.
- If remaining budget is insufficient, provide scaled-down alternatives, not failures.`,

    CHAT_COMPANION: `You are Voyage, VoyageAI's AI travel companion — a knowledgeable, warm, and 
resourceful assistant who feels like a local expert friend in every city.

Your personality:
- Enthusiastic but concise. Never over-explain.
- Culturally aware and sensitive.
- Proactive: anticipate the traveler's next question.
- Practical: always give actionable advice, not just information.

Capabilities:
- Answer questions about destinations, logistics, culture, food, safety.
- Help troubleshoot itinerary problems in real-time.
- Provide emergency guidance (nearest hospital, embassy, etc.)
- Make personalized recommendations based on travel DNA.

Rules:
- Keep responses conversational but informative.
- Return structured JSON matching the schema — never raw text.
- For emergencies, always provide emergency contacts in the relatedTips field.
- suggestedActions should be actionable UI buttons the app can render.`,

    PACKING_ASSISTANT: `You are VoyageAI's intelligent packing advisor — a seasoned travel expert who 
knows exactly what to pack for every destination, climate, and activity combination.

Your expertise:
- Climate-appropriate clothing and gear recommendations.
- Destination-specific items (adapters, medications, cultural dress codes).
- Activity-specific gear (hiking, beach, business, adventure).
- Minimalist packing philosophy — quality over quantity.
- Weight optimization for carry-on vs checked luggage.

Rules:
- Always mark truly essential items (passport, medication, chargers) as isEssential: true.
- Respect dietary restrictions and mobility considerations from travel DNA.
- Return ONLY valid JSON matching the schema.
- Items must be grouped by category in the response.
- Never include obviously redundant items.`,

    TRIP_SIMULATOR: `You are VoyageAI's trip risk analyst and contingency planner.

Your role is to stress-test travel itineraries against real-world scenarios to help travelers 
prepare for disruptions, make informed decisions, and feel confident.

Simulation approach:
- Analyze each scenario based on destination-specific risk factors.
- Assess realistic probability based on season, destination, and trip structure.
- Provide concrete, actionable contingency plans — not generic advice.
- Insurance recommendations should be tailored to the risk profile.

Rules:
- Probability scores must be realistic (0.0–1.0), not uniformly high.
- For high-impact scenarios, always include an alternativePlan.
- Return ONLY valid JSON matching the schema.
- Risk scores must be logically consistent with individual scenario impacts.`,
} as const;

// ─────────────────────────────────────────
//  Layer 2: Context Injection Templates
// ─────────────────────────────────────────

export function buildTravelDNAContext(dna?: TravelDNA): string {
    if (!dna) return "No Travel DNA profile available. Use general traveler assumptions.";

    return `
## Traveler DNA Profile
- Travel Styles: ${dna.travelStyles.join(", ")}
- Pace Preference: ${dna.pacePreference} (${dna.pacePreference === "slow"
            ? "max 3 activities/day, long rests"
            : dna.pacePreference === "moderate"
                ? "4-5 activities/day, balanced"
                : "6+ activities/day, maximizing coverage"
        })
- Budget Tier: ${dna.budgetTier}
- Dietary Restrictions: ${dna.dietaryRestrictions.length > 0 ? dna.dietaryRestrictions.join(", ") : "None"}
- Mobility Considerations: ${dna.mobilityConsiderations.length > 0 ? dna.mobilityConsiderations.join(", ") : "None"}
- Key Interests: ${dna.interests.join(", ")}
- Avoid: ${dna.avoidanceList.length > 0 ? dna.avoidanceList.join(", ") : "Nothing specified"}
- Preferred Accommodation: ${dna.preferredAccommodation}
- Languages: ${dna.languages.join(", ")}
- Previously Visited: ${dna.previousDestinations.length > 0 ? dna.previousDestinations.join(", ") : "None recorded"}

Apply these preferences throughout every recommendation. They are non-negotiable constraints.
`.trim();
}

export function buildItineraryContext(itinerary?: Itinerary): string {
    if (!itinerary) return "No existing itinerary provided.";

    return `
## Current Trip Context
- Destination: ${itinerary.destination}
- Dates: ${itinerary.startDate} to ${itinerary.endDate} (${itinerary.totalDays} days)
- Total Budget: ${itinerary.totalEstimatedCost.amount} ${itinerary.totalEstimatedCost.currency}
- Overall Pacing Score: ${itinerary.pacingAnalysis.overallScore}/10
- Pacing Warnings: ${itinerary.pacingAnalysis.warnings.length > 0
            ? itinerary.pacingAnalysis.warnings.join("; ")
            : "None"
        }
- Days Planned: ${itinerary.totalDays}
- Current AI Insights: ${itinerary.aiInsights.join(" | ")}
`.trim();
}

// ─────────────────────────────────────────
//  Layer 3: Schema Enforcement Prompts
// ─────────────────────────────────────────

export const SCHEMA_INSTRUCTIONS = {
    ITINERARY: `
## Output Schema (STRICT)
Return ONLY a valid JSON object with this exact structure:
{
  "tripId": "string",
  "destination": "string",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD", 
  "totalDays": number,
  "days": [
    {
      "day": number,
      "date": "YYYY-MM-DD",
      "theme": "string (e.g., 'Cultural Immersion & Street Food')",
      "activities": [
        {
          "id": "string (uuid-like)",
          "name": "string",
          "type": "sightseeing|dining|adventure|cultural|shopping|relaxation|transport|accommodation",
          "startTime": "HH:MM",
          "endTime": "HH:MM",
          "duration_minutes": number,
          "location": { "name": "string", "address": "string", "lat": number, "lng": number },
          "estimatedCost": { "amount": number, "currency": "USD" },
          "notes": "string",
          "aiGenerated": true,
          "fatigueScore": number (0-10),
          "tags": ["string"]
        }
      ],
      "totalCost": { "amount": number, "currency": "USD" },
      "dailyFatigueScore": number (0-10),
      "tips": ["string"]
    }
  ],
  "totalEstimatedCost": { 
    "amount": number, 
    "currency": "USD",
    "breakdown": { "accommodation": number, "food": number, "activities": number, "transport": number }
  },
  "aiInsights": ["string"],
  "pacingAnalysis": {
    "overallScore": number (0-10),
    "warnings": ["string"],
    "suggestions": ["string"]
  },
  "generatedAt": "ISO 8601 datetime",
  "modelVersion": "voyage-ai-v1.0"
}`,

    REOPTIMIZE: `
## Output Schema (STRICT)
Return ONLY a valid JSON object with this structure:
{
  "tripId": "string",
  "originalItinerary": { /* same as Itinerary schema */ },
  "reoptimizedItinerary": { /* same as Itinerary schema */ },
  "changesSummary": [
    { "day": number, "type": "added|removed|modified|reordered", "description": "string" }
  ],
  "budgetDelta": number (positive = over, negative = saved),
  "aiReasoning": "string (detailed explanation)",
  "reoptimizedAt": "ISO 8601 datetime"
}`,

    CHAT: `
## Output Schema (STRICT)  
Return ONLY a valid JSON object:
{
  "message": "string (your response to the user)",
  "intent": "string (detected intent)",
  "suggestedActions": [
    { "label": "string (button text)", "action": "string (action id)", "payload": {} }
  ],
  "relatedTips": ["string"],
  "confidenceScore": number (0.0-1.0),
  "modelVersion": "voyage-ai-v1.0",
  "respondedAt": "ISO 8601 datetime"
}`,

    PACKING: `
## Output Schema (STRICT)
Return ONLY a valid JSON object:
{
  "tripId": "string|null",
  "destination": "string",
  "totalItems": number,
  "essentialItems": number,
  "items": {
    "clothing": [{ "id": "string", "name": "string", "category": "clothing", "quantity": number, "isEssential": boolean, "weightGrams": number, "notes": "string", "packed": false, "aiRecommended": true, "reason": "string" }],
    "toiletries": [...],
    "electronics": [...],
    "documents": [...],
    "medication": [...],
    "gear": [...],
    "entertainment": [...],
    "food": [...],
    "safety": [...],
    "miscellaneous": [...]
  },
  "aiTips": ["string"],
  "estimatedTotalWeightKg": number,
  "generatedAt": "ISO 8601 datetime",
  "modelVersion": "voyage-ai-v1.0"
}`,

    SIMULATION: `
## Output Schema (STRICT)
Return ONLY a valid JSON object:
{
  "tripId": "string|null",
  "destination": "string",
  "overallRiskScore": number (0-10),
  "riskLevel": "low|moderate|high|extreme",
  "outcomes": [
    {
      "scenario": "weather_disruption|flight_delay|budget_stress_test|...",
      "probability": number (0.0-1.0),
      "impactLevel": "low|medium|high|critical",
      "affectedDays": [number],
      "description": "string",
      "recommendations": ["string"],
      "alternativePlan": { "summary": "string", "keyChanges": ["string"], "budgetImpact": number },
      "contingencyTips": ["string"]
    }
  ],
  "topRecommendations": ["string"],
  "insuranceRecommendation": "string",
  "flexibilityScore": number (0-10),
  "simulatedAt": "ISO 8601 datetime",
  "modelVersion": "voyage-ai-v1.0"
}`,
} as const;

// ─────────────────────────────────────────
//  Prompt Builder Utilities
// ─────────────────────────────────────────

export interface PromptLayers {
    system: string;
    context: string;
    schema: string;
    task: string;
}

export function buildFullPrompt(layers: PromptLayers): string {
    return `${layers.system}

---

${layers.context}

---

${layers.schema}

---

## Your Task
${layers.task}`;
}

export function estimateTokenCount(text: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
}

export const MAX_CONTEXT_TOKENS = 16000;

export function truncateContext(context: string, maxChars = 6000): string {
    if (context.length <= maxChars) return context;
    return context.substring(0, maxChars) + "\n\n[Context truncated to fit token limit]";
}
