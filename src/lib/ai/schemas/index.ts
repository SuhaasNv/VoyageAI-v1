/**
 * AI Orchestration Layer — Zod Schemas
 * Enforces structured JSON input/output for every AI endpoint.
 */

import { z } from "zod";

// ─────────────────────────────────────────
//  Shared primitive schemas
// ─────────────────────────────────────────

export const TravelStyleSchema = z.enum([
    "adventure",
    "cultural",
    "relaxation",
    "foodie",
    "luxury",
    "budget",
    "family",
    "solo",
    "romantic",
    "business",
]);

export const PacePreferenceSchema = z.enum(["slow", "moderate", "fast"]);

export const BudgetTierSchema = z.enum(["budget", "mid-range", "luxury"]);

export const ActivityTypeSchema = z.enum([
    "sightseeing",
    "dining",
    "adventure",
    "cultural",
    "shopping",
    "relaxation",
    "transport",
    "accommodation",
]);

// ─────────────────────────────────────────
//  Travel DNA Profile
// ─────────────────────────────────────────

export const TravelDNASchema = z.object({
    userId: z.string().cuid().optional(),
    travelStyles: z.array(TravelStyleSchema).min(1).max(5),
    pacePreference: PacePreferenceSchema,
    budgetTier: BudgetTierSchema,
    dietaryRestrictions: z.array(z.string()).default([]),
    mobilityConsiderations: z.array(z.string()).default([]),
    interests: z.array(z.string()).min(1).max(20),
    avoidanceList: z.array(z.string()).default([]),
    preferredAccommodation: z
        .enum(["hotel", "hostel", "airbnb", "resort", "boutique", "any"])
        .default("any"),
    languages: z.array(z.string()).default(["english"]),
    previousDestinations: z.array(z.string()).default([]),
});

export type TravelDNA = z.infer<typeof TravelDNASchema>;

// ─────────────────────────────────────────
//  Itinerary Activity
// ─────────────────────────────────────────

export const ActivitySchema = z.object({
    id: z.string(),
    name: z.string().min(1),
    type: ActivityTypeSchema,
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format required"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM format required"),
    duration_minutes: z.number().int().positive(),
    location: z.object({
        name: z.string(),
        address: z.string().optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
    }),
    estimatedCost: z.object({
        amount: z.number().nonnegative(),
        currency: z.string().length(3),
    }),
    notes: z.string().optional(),
    aiGenerated: z.boolean().default(true),
    fatigueScore: z.number().min(0).max(10).optional(),
    tags: z.array(z.string()).default([]),
});

export type Activity = z.infer<typeof ActivitySchema>;

// ─────────────────────────────────────────
//  Itinerary Day
// ─────────────────────────────────────────

export const ItineraryDaySchema = z.object({
    day: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format required"),
    theme: z.string(),
    activities: z.array(ActivitySchema).min(1),
    totalCost: z.object({
        amount: z.number().nonnegative(),
        currency: z.string().length(3),
    }),
    dailyFatigueScore: z.number().min(0).max(10),
    tips: z.array(z.string()).default([]),
});

export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

// ─────────────────────────────────────────
//  Full Itinerary
// ─────────────────────────────────────────

export const ItinerarySchema = z.object({
    tripId: z.string(),
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    totalDays: z.number().int().positive(),
    days: z.array(ItineraryDaySchema).min(1, "Itinerary must have at least one day with activities"),
    totalEstimatedCost: z.object({
        amount: z.number().nonnegative(),
        currency: z.string().length(3),
        breakdown: z.record(z.string(), z.number()),
    }),
    aiInsights: z.array(z.string()),
    pacingAnalysis: z.object({
        overallScore: z.number().min(0).max(10),
        warnings: z.array(z.string()),
        suggestions: z.array(z.string()),
    }),
    generatedAt: z.string().datetime(),
    modelVersion: z.string(),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;

// ─────────────────────────────────────────
//  Request Schemas — Itinerary Generation
// ─────────────────────────────────────────

export const GenerateItineraryRequestSchema = z.object({
    destination: z.string().min(1).max(200),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    budget: z.object({
        total: z.number().positive(),
        currency: z.string().length(3).default("USD"),
        flexibility: z.enum(["strict", "flexible", "very-flexible"]).default("flexible"),
    }),
    groupSize: z.number().int().positive().max(50).default(1),
    travelDNA: TravelDNASchema.optional(),
    specificRequests: z.string().max(1000).optional(),
    mustSeeAttractions: z.array(z.string()).max(10).default([]),
    avoidAttractions: z.array(z.string()).max(10).default([]),
});

export type GenerateItineraryRequest = z.infer<typeof GenerateItineraryRequestSchema>;

// ─────────────────────────────────────────
//  Request Schemas — Trip Reoptimization
// ─────────────────────────────────────────

export const ReoptimizationReasonSchema = z.enum([
    "weather",
    "budget_overrun",
    "fatigue",
    "missed_activity",
    "preference_change",
    "time_constraint",
    "new_interest",
]);

export const ReoptimizeRequestSchema = z.object({
    tripId: z.string(),
    currentItinerary: ItinerarySchema,
    reoptimizationReasons: z.array(ReoptimizationReasonSchema).min(1),
    currentDay: z.number().int().positive(),
    remainingBudget: z.number().nonnegative(),
    userFeedback: z.string().max(1000).optional(),
    lockedDays: z.array(z.number()).default([]),
    travelDNA: TravelDNASchema.optional(),
});

export type ReoptimizeRequest = z.infer<typeof ReoptimizeRequestSchema>;

export const ReoptimizeResponseSchema = z.object({
    tripId: z.string(),
    originalItinerary: ItinerarySchema,
    reoptimizedItinerary: ItinerarySchema,
    changesSummary: z.array(
        z.object({
            day: z.number(),
            type: z.enum(["added", "removed", "modified", "reordered"]),
            description: z.string(),
        })
    ),
    budgetDelta: z.number(),
    aiReasoning: z.string(),
    reoptimizedAt: z.string().datetime(),
});

export type ReoptimizeResponse = z.infer<typeof ReoptimizeResponseSchema>;

// ─────────────────────────────────────────
//  Request Schemas — AI Chat Companion
// ─────────────────────────────────────────

export const ChatRoleSchema = z.enum(["user", "assistant", "system"]);

export const ChatMessageSchema = z.object({
    role: ChatRoleSchema,
    content: z.string().min(1).max(4000),
    timestamp: z.string().datetime().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
    tripId: z.string().optional(),
    messages: z.array(ChatMessageSchema).min(1).max(50),
    travelDNA: TravelDNASchema.optional(),
    currentItinerary: ItinerarySchema.optional(),
    currentLocation: z
        .object({
            lat: z.number(),
            lng: z.number(),
            cityName: z.string().optional(),
        })
        .optional(),
    intent: z
        .enum([
            "general_query",
            "itinerary_help",
            "recommendation",
            "booking_help",
            "emergency",
            "local_tips",
        ])
        .default("general_query"),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
    message: z.string(),
    intent: z.string(),
    suggestedActions: z
        .array(
            z.object({
                label: z.string(),
                action: z.string(),
                payload: z.record(z.string(), z.unknown()).optional(),
            })
        )
        .default([]),
    relatedTips: z.array(z.string()).default([]),
    confidenceScore: z.number().min(0).max(1),
    modelVersion: z.string(),
    respondedAt: z.string().datetime(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ─────────────────────────────────────────
//  Request Schemas — Packing List Generator
// ─────────────────────────────────────────

export const PackingCategorySchema = z.enum([
    "clothing",
    "toiletries",
    "electronics",
    "documents",
    "medication",
    "gear",
    "entertainment",
    "food",
    "safety",
    "miscellaneous",
]);

export const PackingItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: PackingCategorySchema,
    quantity: z.number().int().positive().default(1),
    isEssential: z.boolean().default(false),
    weightGrams: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    packed: z.boolean().default(false),
    aiRecommended: z.boolean().default(true),
    reason: z.string().optional(),
});

export type PackingItem = z.infer<typeof PackingItemSchema>;

export const PackingListRequestSchema = z.object({
    tripId: z.string().optional(),
    destination: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activities: z.array(ActivityTypeSchema).default([]),
    travelDNA: TravelDNASchema.optional(),
    climate: z
        .enum([
            "tropical",
            "desert",
            "temperate",
            "cold",
            "arctic",
            "mediterranean",
            "unknown",
        ])
        .default("unknown"),
    includeCategories: z.array(PackingCategorySchema).optional(),
    existingItems: z.array(z.string()).default([]),
});

export type PackingListRequest = z.infer<typeof PackingListRequestSchema>;

export const PackingListResponseSchema = z.object({
    tripId: z.string().optional(),
    destination: z.string(),
    totalItems: z.number(),
    essentialItems: z.number(),
    items: z.record(PackingCategorySchema, z.array(PackingItemSchema)),
    aiTips: z.array(z.string()),
    estimatedTotalWeightKg: z.number().optional(),
    generatedAt: z.string().datetime(),
    modelVersion: z.string(),
});

export type PackingListResponse = z.infer<typeof PackingListResponseSchema>;

// ─────────────────────────────────────────
//  Request Schemas — Trip Simulation
// ─────────────────────────────────────────

export const SimulationScenarioSchema = z.enum([
    "weather_disruption",
    "flight_delay",
    "budget_stress_test",
    "peak_season",
    "off_season",
    "local_event",
    "health_issue",
    "lost_documents",
]);

export const SimulationRequestSchema = z.object({
    tripId: z.string().optional(),
    itinerary: ItinerarySchema,
    scenarios: z.array(SimulationScenarioSchema).min(1).max(5),
    travelDNA: TravelDNASchema.optional(),
    simulationDepth: z.enum(["quick", "detailed", "comprehensive"]).default("detailed"),
});

export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;

export const SimulationOutcomeSchema = z.object({
    scenario: SimulationScenarioSchema,
    probability: z.number().min(0).max(1),
    impactLevel: z.enum(["low", "medium", "high", "critical"]),
    affectedDays: z.array(z.number()),
    description: z.string(),
    recommendations: z.array(z.string()),
    alternativePlan: z
        .object({
            summary: z.string(),
            keyChanges: z.array(z.string()),
            budgetImpact: z.number(),
        })
        .optional(),
    contingencyTips: z.array(z.string()),
});

export type SimulationOutcome = z.infer<typeof SimulationOutcomeSchema>;

export const SimulationResponseSchema = z.object({
    tripId: z.string().optional(),
    destination: z.string(),
    overallRiskScore: z.number().min(0).max(10),
    riskLevel: z.enum(["low", "moderate", "high", "extreme"]),
    outcomes: z.array(SimulationOutcomeSchema),
    topRecommendations: z.array(z.string()),
    insuranceRecommendation: z.string(),
    flexibilityScore: z.number().min(0).max(10),
    simulatedAt: z.string().datetime(),
    modelVersion: z.string(),
});

export type SimulationResponse = z.infer<typeof SimulationResponseSchema>;

// ─────────────────────────────────────────
//  Create Trip From Text
// ─────────────────────────────────────────

export const TripStyleSchema = z.enum([
    "relaxed",
    "creative",
    "exciting",
    "luxury",
    "budget",
]);

export const CreateTripFromTextInputSchema = z.object({
    text: z.string().min(1).max(2000),
});

export const CreateTripFromTextOutputSchema = z
    .object({
        destination: z.string().min(2).max(200),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        budget: z
            .object({
                total: z.number().nonnegative(),
                currency: z.string().length(3).default("USD"),
            })
            .optional(),
        style: TripStyleSchema.optional(),
    })
    .refine(
        (d) => new Date(d.endDate) >= new Date(d.startDate),
        { message: "endDate must be on or after startDate", path: ["endDate"] }
    );

export type CreateTripFromTextInput = z.infer<typeof CreateTripFromTextInputSchema>;
export type CreateTripFromTextOutput = z.infer<typeof CreateTripFromTextOutputSchema>;

// ─────────────────────────────────────────
//  Extract Trip From Ticket (PDF)
// ─────────────────────────────────────────

export const ExtractTripFromTicketOutputSchema = z
    .object({
        departureCity: z.string().min(2).max(200),
        destination: z.string().min(2).max(200),
        departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .refine(
        (d) => new Date(d.returnDate) >= new Date(d.departureDate),
        { message: "returnDate must be on or after departureDate", path: ["returnDate"] }
    );

export type ExtractTripFromTicketOutput = z.infer<typeof ExtractTripFromTicketOutputSchema>;

// ─────────────────────────────────────────
//  Dashboard Suggestions
// ─────────────────────────────────────────

export const DashboardSuggestionSchema = z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    action: z.string().max(50).optional(),
    tag: z.string().max(30).optional(),
});

export const DashboardSuggestionsOutputSchema = z.object({
    suggestions: z.array(DashboardSuggestionSchema).length(2),
});

export type DashboardSuggestion = z.infer<typeof DashboardSuggestionSchema>;
export type DashboardSuggestionsOutput = z.infer<typeof DashboardSuggestionsOutputSchema>;

// ─────────────────────────────────────────
//  Generic AI Error Schema
// ─────────────────────────────────────────

export const AIErrorSchema = z.object({
    code: z.enum([
        "RATE_LIMIT_EXCEEDED",
        "INVALID_INPUT",
        "LLM_ERROR",
        "SCHEMA_VALIDATION_FAILED",
        "CONTEXT_TOO_LARGE",
        "FALLBACK_TRIGGERED",
        "TIMEOUT",
        "UNKNOWN",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
    retryAfter: z.number().optional(),
});

export type AIError = z.infer<typeof AIErrorSchema>;
