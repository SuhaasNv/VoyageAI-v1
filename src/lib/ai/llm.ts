/**
 * AI Orchestration Layer — Mock LLM Client
 *
 * Architecture:
 * - Implements the LLMClient interface for easy swap to real providers
 * - Supports: Groq (Llama 3.1/3.3), Gemini 1.5 Flash, OpenAI GPT-4o
 * - Structured for real integration — just swap the execute() implementation
 * - Includes retry logic, timeout handling, and response parsing
 *
 * To integrate a real LLM:
 * 1. Set LLM_PROVIDER env var to "groq" | "gemini" | "openai"
 * 2. Set the corresponding API key env var
 * 3. The LLMClientFactory will return the correct implementation
 */

import { AIErrorSchema, type AIError } from "./schemas";
import { logLLMUsage } from "./usageLogger";
import { getRequestId, getRequestPathname } from "@/lib/requestContext";
import { logInfo, logError } from "@/lib/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─────────────────────────────────────────
//  LLM Client Interface
// ─────────────────────────────────────────

export interface LLMMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface LLMRequestOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "json" | "text";
    timeoutMs?: number;
    retries?: number;
}

export interface LLMResponse {
    content: string;
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    provider: string;
}

export interface LLMClient {
    execute(
        messages: LLMMessage[],
        options?: LLMRequestOptions
    ): Promise<LLMResponse>;
}

// ─────────────────────────────────────────
//  Custom AI Error
// ─────────────────────────────────────────

export class AIServiceError extends Error {
    constructor(
        public readonly code: AIError["code"],
        message: string,
        public readonly details?: unknown,
        public readonly retryAfter?: number
    ) {
        super(message);
        this.name = "AIServiceError";
    }

    toJSON(): AIError {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
            retryAfter: this.retryAfter,
        };
    }
}

// ─────────────────────────────────────────
//  Mock LLM Client (Development & Testing)
// ─────────────────────────────────────────

/**
 * MockLLMClient — Simulates LLM responses with realistic latency.
 * Returns structurally valid mock data for all AI endpoints.
 * Production swap: replace execute() with real API call.
 */
class MockLLMClient implements LLMClient {
    private readonly simulatedLatencyMs = { min: 800, max: 2400 };

    async execute(
        messages: LLMMessage[],
        options: LLMRequestOptions = {}
    ): Promise<LLMResponse> {
        const startTime = Date.now();

        // Simulate network latency
        const latency =
            this.simulatedLatencyMs.min +
            Math.random() *
            (this.simulatedLatencyMs.max - this.simulatedLatencyMs.min);
        await this.sleep(latency);

        // Simulate occasional transient errors (5% rate) for error handling testing
        if (Math.random() < 0.05) {
            throw new AIServiceError(
                "LLM_ERROR",
                "Simulated transient LLM error (5% failure rate for testing)",
                { provider: "mock" }
            );
        }

        const systemPrompt =
            messages.find((m) => m.role === "system")?.content ?? "";
        const userPrompt =
            messages.find((m) => m.role === "user")?.content ?? "";

        const responseContent = this.generateMockResponse(systemPrompt, userPrompt);
        const totalTokens = Math.floor(
            (systemPrompt.length + userPrompt.length + responseContent.length) / 4
        );

        return {
            content: responseContent,
            modelUsed: options.model ?? "voyage-ai-mock-v1.0",
            promptTokens: Math.floor(totalTokens * 0.6),
            completionTokens: Math.floor(totalTokens * 0.4),
            totalTokens,
            latencyMs: Date.now() - startTime,
            provider: "mock",
        };
    }

    private generateMockResponse(system: string, _user: string): string {
        const now = new Date().toISOString();

        // Route to the correct mock based on system prompt content
        if (system.includes("itinerary architect")) {
            return JSON.stringify(this.mockItineraryResponse(now));
        }
        if (system.includes("adaptive trip intelligence")) {
            return JSON.stringify(this.mockReoptimizeResponse(now));
        }
        if (system.includes("AI travel companion")) {
            return JSON.stringify(this.mockChatResponse(now));
        }
        if (system.includes("packing advisor")) {
            return JSON.stringify(this.mockPackingResponse(now));
        }
        if (system.includes("trip risk analyst")) {
            return JSON.stringify(this.mockSimulationResponse(now));
        }
        if (system.includes("trip creation assistant")) {
            return JSON.stringify(this.mockCreateTripFromTextResponse(now));
        }
        if (system.includes("ticket parser")) {
            return JSON.stringify(this.mockExtractTripFromTicketResponse(now));
        }
        if (system.includes("contextual suggestion engine")) {
            return JSON.stringify(this.mockDashboardSuggestionsResponse(now));
        }

        return JSON.stringify({ message: "Unknown endpoint", modelVersion: "voyage-ai-mock-v1.0" });
    }

    private mockItineraryResponse(now: string) {
        return {
            tripId: `trip_${Date.now()}`,
            destination: "Tokyo, Japan",
            startDate: "2025-04-01",
            endDate: "2025-04-05",
            totalDays: 5,
            days: [
                {
                    day: 1,
                    date: "2025-04-01",
                    theme: "Arrival & Shinjuku Immersion",
                    activities: [
                        {
                            id: `act_${Date.now()}_1`,
                            name: "Check in at Hotel & Refresh",
                            type: "accommodation",
                            startTime: "15:00",
                            endTime: "16:30",
                            duration_minutes: 90,
                            location: {
                                name: "Shinjuku Washington Hotel",
                                address: "3-2-9 Nishi-Shinjuku, Tokyo",
                                lat: 35.6897,
                                lng: 139.6922,
                            },
                            estimatedCost: { amount: 120, currency: "USD" },
                            notes: "Check-in typically at 3PM. Store luggage if early arrival.",
                            aiGenerated: true,
                            fatigueScore: 1,
                            tags: ["accommodation", "rest"],
                        },
                        {
                            id: `act_${Date.now()}_2`,
                            name: "Shinjuku Gyoen National Garden",
                            type: "sightseeing",
                            startTime: "16:30",
                            endTime: "18:30",
                            duration_minutes: 120,
                            location: {
                                name: "Shinjuku Gyoen",
                                address: "11 Naitomachi, Shinjuku City",
                                lat: 35.6851,
                                lng: 139.7106,
                            },
                            estimatedCost: { amount: 5, currency: "USD" },
                            notes:
                                "Cherry blossoms peak in late March to early April. Arrive 1 hour before closing.",
                            aiGenerated: true,
                            fatigueScore: 2,
                            tags: ["nature", "cherry-blossoms", "peaceful"],
                        },
                        {
                            id: `act_${Date.now()}_3`,
                            name: "Omoide Yokocho (Memory Lane) Dinner",
                            type: "dining",
                            startTime: "19:00",
                            endTime: "21:00",
                            duration_minutes: 120,
                            location: {
                                name: "Omoide Yokocho",
                                address: "1-2-11 Nishi-Shinjuku, Tokyo",
                                lat: 35.6918,
                                lng: 139.7001,
                            },
                            estimatedCost: { amount: 30, currency: "USD" },
                            notes:
                                "Classic yakitori alley. Try: Sakura (chicken), tsukune, and a cold Sapporo.",
                            aiGenerated: true,
                            fatigueScore: 2,
                            tags: ["food", "yakitori", "local-experience"],
                        },
                    ],
                    totalCost: { amount: 155, currency: "USD" },
                    dailyFatigueScore: 3,
                    tips: [
                        "Get a Suica card at the airport for seamless transit.",
                        "Jet lag tip: stay awake until 10PM local time on arrival day.",
                    ],
                },
            ],
            totalEstimatedCost: {
                amount: 1850,
                currency: "USD",
                breakdown: {
                    accommodation: 600,
                    food: 350,
                    activities: 400,
                    transport: 200,
                    shopping: 300,
                },
            },
            aiInsights: [
                "Cherry blossom season (late March–early April) makes this the optimal time for Tokyo.",
                "Japan Rail Pass not cost-effective for Tokyo-only trips; Suica card recommended.",
                "Pace is set to moderate — 4-5 activities per day with built-in rest windows.",
            ],
            pacingAnalysis: {
                overallScore: 7.2,
                warnings: [],
                suggestions: [
                    "Consider adding a rest afternoon on Day 3 after the intensive Day 2 schedule.",
                ],
            },
            generatedAt: now,
            modelVersion: "voyage-ai-mock-v1.0",
        };
    }

    private mockReoptimizeResponse(now: string) {
        const mockItinerary = this.mockItineraryResponse(now);
        return {
            tripId: mockItinerary.tripId,
            originalItinerary: mockItinerary,
            reoptimizedItinerary: {
                ...mockItinerary,
                aiInsights: [
                    "Reoptimized due to weather disruption. Day 3 outdoor activities moved indoors.",
                    "Budget adjusted: saved $120 by swapping to local ramen spots.",
                ],
                pacingAnalysis: {
                    overallScore: 8.1,
                    warnings: [],
                    suggestions: ["Reoptimized schedule now has better pacing with weather backup plans."],
                },
            },
            changesSummary: [
                {
                    day: 3,
                    type: "modified",
                    description:
                        "Outdoor activities replaced with Teamlab Borderless (covers rain day) + indoor ramen tour.",
                },
                {
                    day: 4,
                    type: "modified",
                    description: "Moved Harajuku shopping earlier to avoid weekend crowds.",
                },
            ],
            budgetDelta: -120,
            aiReasoning:
                "With rain forecasted for Day 3, I swapped outdoor-heavy activities for premium indoor experiences. TeamLab Borderless provides a wow-factor alternative that aligns perfectly with your cultural and technology interests. The budget delta is negative — you'll actually save $120 with this reoptimization.",
            reoptimizedAt: now,
        };
    }

    private mockChatResponse(now: string) {
        return {
            message:
                "Great question! The best way to get from Narita Airport to Shinjuku is the Narita Express (N'EX). It takes about 80 minutes and costs ¥3,070 (~$20 USD). With your Suica card, transit around Tokyo becomes seamless — no need to buy individual tickets. The train departs every 30 minutes!",
            intent: "local_tips",
            suggestedActions: [
                {
                    label: "Add to Itinerary Notes",
                    action: "add_note",
                    payload: { note: "Narita Express: ¥3,070, 80 min to Shinjuku" },
                },
                {
                    label: "Show All Transport Tips",
                    action: "show_transport_tips",
                    payload: {},
                },
                {
                    label: "Ask About Day 1 Activities",
                    action: "chat_query",
                    payload: { query: "What should I do on my first evening in Tokyo?" },
                },
            ],
            relatedTips: [
                "Buy your Suica card at the JR ticket machines after passport control.",
                "The N'EX requires a reserved seat — book at least a day in advance online.",
                "Luggage forwarding (takkyubin) from airport to hotel costs ~¥2,500 per bag.",
            ],
            confidenceScore: 0.94,
            modelVersion: "voyage-ai-mock-v1.0",
            respondedAt: now,
        };
    }

    private mockPackingResponse(now: string) {
        return {
            tripId: null,
            destination: "Tokyo, Japan",
            totalItems: 38,
            essentialItems: 12,
            items: {
                clothing: [
                    {
                        id: `item_${Date.now()}_1`,
                        name: "Comfortable walking shoes",
                        category: "clothing",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 650,
                        notes: "You'll walk 15,000+ steps/day in Tokyo. Break them in before traveling.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Tokyo requires extensive walking across large neighborhoods.",
                    },
                    {
                        id: `item_${Date.now()}_2`,
                        name: "Light rain jacket / packable umbrella",
                        category: "clothing",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 300,
                        notes: "Spring in Tokyo has unpredictable showers. A packable one saves luggage space.",
                        packed: false,
                        aiRecommended: true,
                        reason: "April has moderate rainfall probability in Tokyo.",
                    },
                    {
                        id: `item_${Date.now()}_3`,
                        name: "Layers / light sweater",
                        category: "clothing",
                        quantity: 2,
                        isEssential: false,
                        weightGrams: 400,
                        notes: "Temperatures range 10-18°C in April. Layering is key.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Spring temperatures are variable — mornings cool, afternoons mild.",
                    },
                ],
                toiletries: [
                    {
                        id: `item_${Date.now()}_4`,
                        name: "Toiletry essentials (100ml rule for carry-on)",
                        category: "toiletries",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 500,
                        notes: "Japanese convenience stores (konbini) stock most toiletries affordably.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Pack light — resupply at 7-Eleven or FamilyMart in Tokyo.",
                    },
                ],
                electronics: [
                    {
                        id: `item_${Date.now()}_5`,
                        name: "Power adapter (Type A — Japan uses flat 2-pin)",
                        category: "electronics",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 120,
                        notes: "Japan uses Type A (same as US). Voltage is 100V — most devices auto-adapt.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Essential for charging all devices.",
                    },
                    {
                        id: `item_${Date.now()}_6`,
                        name: "Portable charger / power bank",
                        category: "electronics",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 250,
                        notes: "20,000mAh recommended for full-day navigation and photography.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Heavy phone usage for maps, translation, and photography drains battery fast.",
                    },
                ],
                documents: [
                    {
                        id: `item_${Date.now()}_7`,
                        name: "Passport (valid 6+ months)",
                        category: "documents",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 40,
                        notes: "Keep a digital copy in cloud storage and email to yourself.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Required for entry into Japan.",
                    },
                    {
                        id: `item_${Date.now()}_8`,
                        name: "Travel insurance documents",
                        category: "documents",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 20,
                        notes: "Print emergency contact number for your insurer.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Medical emergencies in Japan can be expensive without insurance.",
                    },
                ],
                medication: [],
                gear: [],
                entertainment: [
                    {
                        id: `item_${Date.now()}_9`,
                        name: "Pocket WiFi or SIM card (pre-booked)",
                        category: "entertainment",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 100,
                        notes: "Book Sakura Mobile or IIJmio eSIM before departure. ~$30/5 days.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Essential for navigation, translation, and communication in Japan.",
                    },
                ],
                food: [],
                safety: [
                    {
                        id: `item_${Date.now()}_10`,
                        name: "Emergency cash (JPY)",
                        category: "safety",
                        quantity: 1,
                        isEssential: true,
                        weightGrams: 30,
                        notes:
                            "Keep ¥10,000–¥20,000 (~$65-$130) in cash. Many local restaurants are cash-only.",
                        packed: false,
                        aiRecommended: true,
                        reason:
                            "Japan is still largely cash-based for small transactions.",
                    },
                ],
                miscellaneous: [
                    {
                        id: `item_${Date.now()}_11`,
                        name: "Small day bag / backpack",
                        category: "miscellaneous",
                        quantity: 1,
                        isEssential: false,
                        weightGrams: 400,
                        notes: "A 20-30L daypack is ideal for daily exploration.",
                        packed: false,
                        aiRecommended: true,
                        reason: "Essential for carrying water, purchases, and electronics while sightseeing.",
                    },
                ],
            },
            aiTips: [
                "Japan is extremely safe — leave the hotel-safe mindset behind and embrace lightweight packing.",
                "Don't overpack clothes — Japanese laundromats (coin laundry) are clean, cheap, and easy.",
                "IC Card (Suica/Pasmo) is your Tokyo lifeline — get one at the airport on Day 1.",
                "Many ryokans (traditional inns) provide yukata robes and toiletries — call ahead.",
                "Keep a pocket-sized umbrella — Tokyo vendors run out during sudden rain showers.",
            ],
            estimatedTotalWeightKg: 8.2,
            generatedAt: now,
            modelVersion: "voyage-ai-mock-v1.0",
        };
    }

    private mockCreateTripFromTextResponse(now: string) {
        return {
            destination: "Tokyo, Japan",
            startDate: "2025-04-01",
            endDate: "2025-04-05",
            budget: { total: 2000, currency: "USD" },
            style: "creative",
        };
    }

    private mockExtractTripFromTicketResponse(now: string) {
        return {
            departureCity: "New York JFK",
            destination: "Tokyo Narita",
            departureDate: "2025-04-01",
            returnDate: "2025-04-08",
        };
    }

    private mockDashboardSuggestionsResponse(now: string) {
        return {
            suggestions: [
                { title: "Optimize Tokyo Itinerary", description: "Heavy walking on Day 3", action: "Review", tag: "Alert" },
                { title: "Price Drop: flights to Reykjavik", description: "Dropped by $120 for your dates", action: "View", tag: "Savings" },
            ],
        };
    }

    private mockSimulationResponse(now: string) {
        return {
            tripId: null,
            destination: "Tokyo, Japan",
            overallRiskScore: 2.8,
            riskLevel: "low",
            outcomes: [
                {
                    scenario: "weather_disruption",
                    probability: 0.35,
                    impactLevel: "low",
                    affectedDays: [2, 3],
                    description:
                        "April in Tokyo has a 35% chance of significant rainfall (avg. 130mm/April). Outdoor cherry blossom viewing and Harajuku walks may be affected.",
                    recommendations: [
                        "Book TeamLab Borderless as indoor backup.",
                        "Carry a compact umbrella at all times.",
                        "Check Japan Weather Association (jwa.go.jp) daily.",
                    ],
                    alternativePlan: {
                        summary:
                            "Swap outdoor activities for Tokyo's world-class museums and indoor experiences.",
                        keyChanges: [
                            "Replace Harajuku outdoor stroll with Harajuku's underground shopping (Laforet)",
                            "Add teamLab Planets immersive digital art experience",
                            "Move Shinjuku park visit to a clear-weather day",
                        ],
                        budgetImpact: 45,
                    },
                    contingencyTips: [
                        "TeamLab tickets must be pre-booked. Reserve now at teamlab.art/e/planets.",
                        "Tokyo National Museum is a sublime rain-day alternative (500 yen entry).",
                    ],
                },
                {
                    scenario: "flight_delay",
                    probability: 0.18,
                    impactLevel: "medium",
                    affectedDays: [1],
                    description:
                        "Tokyo's Narita and Haneda airports are highly efficient, but 18% of international arrivals experience delays exceeding 2 hours.",
                    recommendations: [
                        "Choose flights arriving before 2PM to buffer Day 1 activities.",
                        "Don't pre-book same-day activities within 4 hours of landing.",
                        "Japanese train connections to city center run until midnight.",
                    ],
                    alternativePlan: {
                        summary:
                            "Compress Day 1 to dinner only — Day 2 picks up the slack without losing key experiences.",
                        keyChanges: [
                            "Skip Day 1 afternoon sightseeing if delayed past 7PM",
                            "Omoide Yokocho dinner remains intact regardless of delay",
                        ],
                        budgetImpact: 0,
                    },
                    contingencyTips: [
                        "Narita has excellent airport lounges if you have Amex Platinum or Priority Pass.",
                        "Airline compensation for EU/US flights: know your rights.",
                    ],
                },
                {
                    scenario: "budget_stress_test",
                    probability: 0.25,
                    impactLevel: "medium",
                    affectedDays: [1, 2, 3, 4, 5],
                    description:
                        "Tokyo spending commonly runs 20-30% over budget for first-time visitors due to souvenir impulse spending and convenience store temptation.",
                    recommendations: [
                        "Set daily cash allowance in physical envelope system.",
                        "Use budget tracking app (Trail Wallet or Trabee Pocket).",
                        "Konbini meals are surprisingly good — budget $8-12/meal vs. $25+ at restaurants.",
                    ],
                    alternativePlan: null,
                    contingencyTips: [
                        "Donki (Don Quijote) for affordable souvenirs vs. airport shops.",
                        "Free activities: Shibuya Crossing, Meiji Shrine, Yanaka neighborhood.",
                        "Ramen or soba sets: ¥800-1,200 for a filling, authentic meal.",
                    ],
                },
            ],
            topRecommendations: [
                "Your trip has a low overall risk profile — Tokyo is one of the world's safest destinations.",
                "The main risks are weather-related. Pre-book indoor backup activities.",
                "Budget slightly over to account for Tokyo's tempting shopping and food scene.",
                "Getting comprehensive travel insurance ($30-50) is highly recommended given healthcare costs in Japan.",
            ],
            insuranceRecommendation:
                "Comprehensive travel insurance with medical coverage up to $100,000 USD is strongly recommended for Japan. Japanese healthcare is excellent but expensive for tourists. Consider World Nomads or SafetyWing for competitive rates.",
            flexibilityScore: 8.4,
            simulatedAt: now,
            modelVersion: "voyage-ai-mock-v1.0",
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

// ─────────────────────────────────────────
//  Groq Client (llama-3.1-8b-instant via OpenAI-compatible endpoint)
// ─────────────────────────────────────────

class GroqLLMClient implements LLMClient {
    private readonly apiKey: string;
    private readonly baseUrl = "https://api.groq.com/openai/v1";
    private readonly defaultModel = "llama-3.1-8b-instant";

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async execute(
        messages: LLMMessage[],
        options: LLMRequestOptions = {}
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        const model = options.model ?? this.defaultModel;
        const timeoutMs = options.timeoutMs ?? 25000;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 4096,
                    // Groq supports JSON mode for structured outputs
                    response_format: options.responseFormat === "json"
                        ? { type: "json_object" }
                        : undefined,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                let errBody: Record<string, unknown> = {};
                try { errBody = await response.json(); } catch { /* ignore */ }
                const groqMessage = (errBody?.error as { message?: string })?.message
                    ?? response.statusText;
                throw new AIServiceError(
                    response.status === 429 ? "RATE_LIMIT_EXCEEDED" : "LLM_ERROR",
                    `Groq API error ${response.status}: ${groqMessage}`,
                    errBody
                );
            }

            const data = await response.json();
            const choice = data.choices?.[0];

            if (!choice?.message?.content) {
                throw new AIServiceError(
                    "LLM_ERROR",
                    `Empty response from Groq API (finish_reason: ${choice?.finish_reason ?? "unknown"})`
                );
            }

            return {
                content: choice.message.content as string,
                modelUsed: (data.model as string) ?? model,
                promptTokens: (data.usage?.prompt_tokens as number) ?? 0,
                completionTokens: (data.usage?.completion_tokens as number) ?? 0,
                totalTokens: (data.usage?.total_tokens as number) ?? 0,
                latencyMs: Date.now() - startTime,
                provider: "groq",
            };
        } catch (err) {
            clearTimeout(timeout);
            if (err instanceof AIServiceError) throw err;
            if ((err as Error).name === "AbortError") {
                throw new AIServiceError(
                    "TIMEOUT",
                    `Groq request timed out after ${timeoutMs}ms`
                );
            }
            throw new AIServiceError(
                "LLM_ERROR",
                `Groq request failed: ${(err as Error).message}`,
                err
            );
        }
    }
}


// ─────────────────────────────────────────
//  Gemini Client Stub (Real Integration Ready)
// ─────────────────────────────────────────

class GeminiLLMClient implements LLMClient {
    private readonly genAI: GoogleGenerativeAI;
    private readonly defaultModel = "gemini-2.5-flash";

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async execute(
        messages: LLMMessage[],
        options: LLMRequestOptions = {}
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        const modelName = options.model ?? process.env.GEMINI_MODEL ?? this.defaultModel;

        try {
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options.temperature ?? 0.7,
                    maxOutputTokens: options.maxTokens ?? 4096,
                    // Only set responseMimeType when JSON is requested; omitting it
                    // avoids errors on models that don't support the field.
                    ...(options.responseFormat === "json" && {
                        responseMimeType: "application/json",
                    }),
                },
            });

            const systemInstruction = messages.find((m) => m.role === "system")?.content;
            const userContent = messages
                .filter((m) => m.role !== "system")
                .map((m) => m.content)
                .join("\n\n");
            const prompt = systemInstruction
                ? `System: ${systemInstruction}\n\nUser: ${userContent}`
                : userContent;

            // No Promise.race timeout — let the SDK surface its own network/deadline
            // errors rather than racing against a hard timer that kills valid responses.
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            if (!text?.trim()) {
                throw new AIServiceError("LLM_ERROR", "Gemini returned an empty response");
            }

            return {
                content: text,
                modelUsed: modelName,
                promptTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
                completionTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
                totalTokens: result.response.usageMetadata?.totalTokenCount ?? 0,
                latencyMs: Date.now() - startTime,
                provider: "gemini",
            };
        } catch (err) {
            // Preserve already-classified errors (e.g. empty-response above).
            if (err instanceof AIServiceError) throw err;

            const msg = (err as Error).message ?? "";

            // Detect rate-limit (429) from Gemini's error message.
            if (
                msg.includes("429") ||
                /quota|rate.?limit/i.test(msg)
            ) {
                throw new AIServiceError(
                    "RATE_LIMIT_EXCEEDED",
                    `Gemini rate limit exceeded: ${msg}`,
                    err
                );
            }

            // Detect auth failures (401/403 / bad API key).
            if (
                msg.includes("403") ||
                msg.includes("401") ||
                /api.?key|unauthorized|permission/i.test(msg)
            ) {
                throw new AIServiceError(
                    "LLM_ERROR",
                    `Gemini authentication error: ${msg}`,
                    err
                );
            }

            throw new AIServiceError(
                "LLM_ERROR",
                `Gemini request failed: ${msg}`,
                err
            );
        }
    }
}

// ─────────────────────────────────────────
//  LLM Client Factory
// ─────────────────────────────────────────

export type LLMProvider = "mock" | "groq" | "gemini";

class LLMClientFactory {
    private static instance: LLMClient | null = null;

    static create(provider?: LLMProvider): LLMClient {
        if (this.instance) return this.instance;

        const resolvedProvider =
            provider ??
            (process.env.LLM_PROVIDER as LLMProvider | undefined) ??
            "mock";

        const isProduction = process.env.NODE_ENV === "production";

        if (isProduction && (resolvedProvider === "mock" || !["groq", "gemini"].includes(resolvedProvider))) {
            throw new AIServiceError(
                "LLM_ERROR",
                `LLM_PROVIDER must be "groq" or "gemini" in production. Got: "${resolvedProvider}". MockLLMClient is not permitted in production.`
            );
        }

        switch (resolvedProvider) {
            case "groq": {
                const key = process.env.GROQ_API_KEY;
                if (!key) throw new AIServiceError("LLM_ERROR", "GROQ_API_KEY is not set");
                this.instance = new GroqLLMClient(key);
                break;
            }
            case "gemini": {
                const key = process.env.GEMINI_API_KEY;
                if (!key) throw new AIServiceError("LLM_ERROR", "GEMINI_API_KEY is not set");
                this.instance = new GeminiLLMClient(key);
                break;
            }
            case "mock":
            default:
                if (isProduction) {
                    throw new AIServiceError("LLM_ERROR", "MockLLMClient is not permitted in production");
                }
                this.instance = new MockLLMClient();
                break;
        }

        return this.instance;
    }

    /** Reset singleton — useful in tests */
    static reset(): void {
        this.instance = null;
    }
}

// ─────────────────────────────────────────
//  Retry Wrapper
// ─────────────────────────────────────────

export async function executeWithRetry(
    client: LLMClient,
    messages: LLMMessage[],
    options: LLMRequestOptions = {}
): Promise<LLMResponse> {
    const maxRetries = options.retries ?? 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff

    let lastError: Error | null = null;
    let shouldFallback = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await client.execute(messages, options);
            logLLMUsage(response, {
                requestId: getRequestId(),
                endpoint: getRequestPathname() ?? undefined,
            }).catch(() => { });
            return response;
        } catch (err) {
            lastError = err as Error;

            // Don't retry on non-retryable errors
            if (err instanceof AIServiceError) {
                const nonRetryable: AIError["code"][] = [
                    "INVALID_INPUT",
                    "SCHEMA_VALIDATION_FAILED",
                    "CONTEXT_TOO_LARGE",
                ];
                if (nonRetryable.includes(err.code)) {
                    throw err; // these don't fallback since they are logic/data errors
                }

                // If rate limited and we have a fallback available, try it instead of retrying
                if (err.code === "RATE_LIMIT_EXCEEDED") {
                    if (!(client instanceof GeminiLLMClient) && process.env.GEMINI_API_KEY) {
                        shouldFallback = true;
                        break;
                    } else {
                        throw err; // if we're already on fallback or it's not available, bubble the 429
                    }
                }
            }

            if (attempt < maxRetries) {
                const delay = retryDelays[attempt] ?? 4000;
                logInfo("[LLM] Attempt failed, retrying", {
                    attempt: attempt + 1,
                    delayMs: delay,
                    message: (err as Error).message,
                    level: "warn",
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                if (!(client instanceof GeminiLLMClient) && process.env.GEMINI_API_KEY) {
                    shouldFallback = true;
                }
            }
        }
    }

    if (shouldFallback && process.env.GEMINI_API_KEY) {
        logError("Primary LLM failed", lastError);
        try {
            // Bypass the singleton so we always get a fresh Gemini client,
            // regardless of which provider the factory already cached.
            const fallbackClient = new GeminiLLMClient(process.env.GEMINI_API_KEY);
            const fallbackOptions = { ...options, timeoutMs: options.timeoutMs ?? 25000 };
            const fallbackResponse = await fallbackClient.execute(messages, fallbackOptions);
            logLLMUsage(fallbackResponse, {
                requestId: getRequestId(),
                endpoint: getRequestPathname() ?? undefined,
            }).catch(() => { });
            return fallbackResponse;
        } catch (gemErr) {
            logError("Gemini fallback failed", gemErr);
            throw new AIServiceError("LLM_ERROR", "All AI providers failed", {
                primaryError: lastError?.message,
                fallbackError: (gemErr as Error).message,
            });
        }
    }

    throw new AIServiceError(
        "LLM_ERROR",
        `LLM request failed after ${maxRetries} retries: ${lastError?.message}`,
        lastError
    );
}

// ─────────────────────────────────────────
//  JSON Parsing Utility
// ─────────────────────────────────────────

/**
 * Safely parses LLM response content as JSON.
 *
 * Three-strategy extraction handles every common LLM output pattern:
 *  1. JSON inside a markdown code fence (anywhere in the text, not just at start)
 *  2. Raw JSON object embedded in surrounding prose — finds first `{` … last `}`
 *  3. Direct parse of the trimmed string (model obeyed the "JSON only" instruction)
 *
 * If all three fail the raw content (first 500 chars) is attached to the error
 * so it can be inspected in logs without leaking sensitive data.
 */
export function parseJSONResponse<T = unknown>(content: string): T {
    // Strategy 1 — extract from ```json … ``` or ``` … ``` fences anywhere in response.
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
        try {
            return JSON.parse(fenceMatch[1].trim()) as T;
        } catch {
            // fall through
        }
    }

    // Strategy 2 — find the outermost JSON object by locating first `{` and last `}`.
    // Handles responses like: "Here is the itinerary:\n\n{ … }"
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as T;
        } catch {
            // fall through
        }
    }

    // Strategy 3 — model followed instructions; try the trimmed string directly.
    try {
        return JSON.parse(content.trim()) as T;
    } catch {
        throw new AIServiceError(
            "SCHEMA_VALIDATION_FAILED",
            "LLM returned invalid JSON",
            { rawContent: content.substring(0, 500) }
        );
    }
}

// ─────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────

export const getLLMClient = (): LLMClient => LLMClientFactory.create();
export { LLMClientFactory };
export { AIErrorSchema };
