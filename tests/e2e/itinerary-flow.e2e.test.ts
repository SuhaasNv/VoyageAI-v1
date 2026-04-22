/**
 * tests/e2e/itinerary-flow.e2e.test.ts
 *
 * Production-level end-to-end test for the VoyageAI itinerary pipeline.
 *
 * Path under test:
 *   POST /api/ai/itinerary-flow/planner
 *   → POST /api/ai/itinerary-flow/research
 *   → POST /api/ai/itinerary-flow/logistics
 *   → POST /api/ai/itinerary-flow/budget
 *   → POST /api/ai/itinerary-flow/safety
 *   → POST /api/ai/itinerary-flow/save
 *
 * Design decisions
 * ─────────────────
 * • NO mocks — every request hits the real running Next.js server on :3000
 * • A real JWT is minted from the same secret the server uses (no separate
 *   login step required — the server validates the token signature, not the DB)
 * • A throwaway Trip row is created in the real DB before the save step and
 *   torn down afterwards so the test is fully self-contained
 * • Budget ledger math is verified deterministically (sum invariant)
 * • All critical response fields are asserted non-null / structurally correct
 * • A shared x-flow-session-id header ties all stages together in server logs
 *
 * Prerequisites
 * ─────────────
 * • `npm run dev` must be running on port 3000
 * • .env must be loaded (DATABASE_URL + JWT_ACCESS_SECRET)
 *
 * Run with:
 *   npx vitest run tests/e2e/itinerary-flow.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { randomUUID, createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

// ─── Environment ──────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;
const CSRF_SECRET = process.env.CSRF_SECRET!;

if (!JWT_SECRET)   throw new Error("JWT_ACCESS_SECRET is not set in environment");
if (!CSRF_SECRET)  throw new Error("CSRF_SECRET is not set in environment");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mint a short-lived JWT that the server's verifyAccessToken() will accept.
 */
function mintTestToken(userId: string, email: string): string {
    return jwt.sign(
        { sub: userId, email, role: "USER" },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: "15m" }
    );
}

/**
 * Generate a valid CSRF token in the same format as generateCsrfTokenEdge():
 *   `<nonce-hex>.<hmac-sha256-hex>`
 *
 * Uses Node.js crypto (identical math to the SubtleCrypto path on the server).
 * The returned token must be sent as both x-csrf-token header AND voyageai_csrf cookie.
 */
function mintCsrfToken(): string {
    const nonce = randomUUID().replace(/-/g, ""); // 32-char hex nonce
    const hmac = createHmac("sha256", CSRF_SECRET).update(nonce).digest("hex");
    return `${nonce}.${hmac}`;
}

/**
 * Thin fetch wrapper — throws a descriptive error on non-2xx so the stage name
 * is preserved in the assertion failure message.
 *
 * Attaches:
 *  - Authorization: Bearer <jwt>
 *  - x-csrf-token + Cookie: voyageai_csrf=<token>  (double-submit pattern)
 *  - x-flow-session-id for correlated server logs
 */
async function callStage<T>(
    stagePath: string,
    body: unknown,
    token: string,
    flowSessionId: string
): Promise<T> {
    const url = `${BASE_URL}/api/ai/itinerary-flow/${stagePath}`;
    const csrfToken = mintCsrfToken();
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "x-csrf-token": csrfToken,
            "Cookie": `voyageai_csrf=${csrfToken}`,
            "x-flow-session-id": flowSessionId,
        },
        body: JSON.stringify(body),
    });

    const json = (await res.json()) as { success: boolean; data?: T; error?: unknown };

    if (!res.ok || !json.success) {
        throw new Error(
            `Stage "${stagePath}" returned ${res.status}:\n${JSON.stringify(json, null, 2)}`
        );
    }

    return json.data as T;
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

/** The test user + trip created in beforeAll and cleaned up in afterAll. */
let testUserId: string;
let testTripId: string;
let authToken: string;

beforeAll(async () => {
    // Find or create a stable test user so we don't pollute real user data.
    const TEST_EMAIL = "e2e-test@voyageai.internal";

    const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: {},
        create: {
            email: TEST_EMAIL,
            name: "E2E Test Bot",
            role: "USER",
            emailVerified: true,
            isActive: true,
            hasOnboarded: true,
        },
    });

    testUserId = user.id;
    authToken = mintTestToken(testUserId, TEST_EMAIL);

    // Create a placeholder trip the save step can update.
    const trip = await prisma.trip.create({
        data: {
            userId: testUserId,
            destination: "Tokyo",
            startDate: new Date("2026-11-01"),
            endDate: new Date("2026-11-05"),
            status: "draft",
        },
    });
    testTripId = trip.id;
});

afterAll(async () => {
    // Clean up: delete trip (itinerary cascades) and test user.
    await prisma.itinerary.deleteMany({ where: { tripId: testTripId } });
    await prisma.trip.deleteMany({ where: { id: testTripId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
});

// ─── Shared flow session ──────────────────────────────────────────────────────

const FLOW_SESSION_ID = randomUUID();

// ─── Sample input payload ─────────────────────────────────────────────────────
// A realistic free-text trip request that the PlannerAgent will parse.

const TRIP_INPUT =
    "I want a 3-day trip to Tokyo, Japan starting November 1st 2026. " +
    "My budget is $2000 USD. I prefer a balanced travel style with a moderate pace.";

// ─── THE TEST ─────────────────────────────────────────────────────────────────

describe("Itinerary Flow — Full Production Pipeline E2E", () => {
    it(
        "validates every stage end-to-end: planner → research → logistics → budget → safety → save",
        async () => {

            // ── STAGE 1: Planner ─────────────────────────────────────────────
            console.log("\n[1/6] Planner...");

            const plannerData = await callStage<{
                destination: string;
                startDate: string;
                endDate: string;
                durationDays: number;
                days: Array<{ day: number; theme: string }>;
                preferences?: { budget?: number; style?: string; pace?: string };
            }>("planner", { input: TRIP_INPUT }, authToken, FLOW_SESSION_ID);

            // ── Planner assertions ────────────────────────────────────────────
            expect(plannerData.destination, "planner.destination must be non-empty").toBeTruthy();
            expect(plannerData.destination).toMatch(/tokyo/i);

            expect(plannerData.startDate, "planner.startDate is required").toBeTruthy();
            expect(plannerData.endDate,   "planner.endDate is required").toBeTruthy();

            expect(plannerData.durationDays, "planner.durationDays must be >= 1").toBeGreaterThanOrEqual(1);
            expect(plannerData.durationDays, "planner.durationDays must be <= 14").toBeLessThanOrEqual(14);

            expect(Array.isArray(plannerData.days), "planner.days must be an array").toBe(true);
            expect(plannerData.days.length, "planner.days.length must equal durationDays")
                .toBe(plannerData.durationDays);

            for (const day of plannerData.days) {
                expect(day.day,   `day[${day.day}].day missing`).toBeTruthy();
                expect(day.theme, `day[${day.day}].theme missing`).toBeTruthy();
            }

            console.log(
                `    ✓ destination="${plannerData.destination}" | ${plannerData.durationDays} days | ${plannerData.startDate} → ${plannerData.endDate}`
            );

            // ── STAGE 2: Research ─────────────────────────────────────────────
            console.log("[2/6] Research...");

            const researchPayload = { ...plannerData };
            const researchData = await callStage<{
                destination: string;
                days: Array<{ day: number; theme: string; activities: unknown[] }>;
                hotels: Array<{ name: string; priceRange: string; area: string; tags: string[] }>;
            }>("research", researchPayload, authToken, FLOW_SESSION_ID);

            // ── Research assertions ───────────────────────────────────────────
            expect(researchData.destination, "research.destination missing").toBeTruthy();
            expect(Array.isArray(researchData.days),   "research.days must be array").toBe(true);
            expect(Array.isArray(researchData.hotels), "research.hotels must be array").toBe(true);

            // At least one hotel option
            expect(researchData.hotels.length, "research must return >= 1 hotel").toBeGreaterThanOrEqual(1);
            for (const hotel of researchData.hotels) {
                expect(hotel.name,       `hotel "${hotel.name}" name missing`).toBeTruthy();
                expect(hotel.priceRange, `hotel "${hotel.name}" priceRange missing`).toBeTruthy();
                expect(hotel.area,       `hotel "${hotel.name}" area missing`).toBeTruthy();
                expect(Array.isArray(hotel.tags)).toBe(true);
            }

            // Each day must have at least 1 activity
            for (const day of researchData.days) {
                expect(
                    Array.isArray(day.activities) && day.activities.length > 0,
                    `research day ${day.day} has no activities`
                ).toBe(true);
            }

            const totalActivities = researchData.days.reduce((s, d) => s + d.activities.length, 0);
            console.log(
                `    ✓ ${researchData.hotels.length} hotels, ${totalActivities} activities across ${researchData.days.length} days`
            );

            // ── STAGE 3: Logistics ────────────────────────────────────────────
            console.log("[3/6] Logistics...");

            const logisticsPayload = {
                destination: researchData.destination,
                startDate:   plannerData.startDate,
                endDate:     plannerData.endDate,
                durationDays: plannerData.durationDays,
                preferences: plannerData.preferences,
                days:   researchData.days,
                hotels: researchData.hotels,
            };

            const logisticsData = await callStage<{
                destination: string;
                days: Array<{
                    day: number;
                    theme: string;
                    activities: Array<{
                        name: string;
                        type: string;
                        timeSlot: string;
                        description: string;
                    }>;
                }>;
                selectedHotel: { name: string; priceRange: string; area: string; tags: string[] };
                foodCostSummary?: { perDay: number[]; total: number; avgPerDay: number };
            }>("logistics", logisticsPayload, authToken, FLOW_SESSION_ID);

            // ── Logistics assertions ──────────────────────────────────────────
            expect(logisticsData.destination, "logistics.destination missing").toBeTruthy();
            expect(Array.isArray(logisticsData.days), "logistics.days must be array").toBe(true);

            expect(logisticsData.selectedHotel, "logistics.selectedHotel is required").toBeTruthy();
            expect(logisticsData.selectedHotel.name, "logistics.selectedHotel.name missing").toBeTruthy();
            expect(["$","$$","$$$","$$$$"], "logistics.selectedHotel.priceRange invalid").toContain(
                logisticsData.selectedHotel.priceRange
            );

            for (const day of logisticsData.days) {
                expect(Array.isArray(day.activities) && day.activities.length > 0,
                    `logistics day ${day.day} has no scheduled activities`
                ).toBe(true);

                for (const act of day.activities) {
                    expect(act.name,        `act "${act.name}" name missing`).toBeTruthy();
                    expect(act.type,        `act "${act.name}" type missing`).toBeTruthy();
                    expect(act.description, `act "${act.name}" description missing`).toBeTruthy();
                    expect(["morning","afternoon","evening"],
                        `act "${act.name}" timeSlot invalid`
                    ).toContain(act.timeSlot);
                }
            }

            if (logisticsData.foodCostSummary) {
                const fs = logisticsData.foodCostSummary;
                expect(fs.total, "foodCostSummary.total must be >= 0").toBeGreaterThanOrEqual(0);
                expect(
                    Math.abs(fs.perDay.reduce((s, v) => s + v, 0) - fs.total),
                    "foodCostSummary: sum(perDay) must equal total"
                ).toBeLessThanOrEqual(1); // allow $1 rounding
            }

            console.log(
                `    ✓ selectedHotel="${logisticsData.selectedHotel.name}" (${logisticsData.selectedHotel.priceRange})`
            );

            // ── STAGE 4: Budget ───────────────────────────────────────────────
            console.log("[4/6] Budget...");

            const budgetPayload = {
                destination:  logisticsData.destination,
                startDate:    plannerData.startDate,
                endDate:      plannerData.endDate,
                durationDays: plannerData.durationDays,
                preferences:  plannerData.preferences,
                days:         logisticsData.days,
                hotels:       researchData.hotels,
                selectedHotel: logisticsData.selectedHotel,
                foodCostSummary: logisticsData.foodCostSummary,
            };

            const budgetData = await callStage<{
                destination: string;
                budget: {
                    totalEstimatedCost: number;
                    costPerDay: number[];
                    isOverBudget: boolean;
                    budgetGap?: number;
                    suggestions?: string[];
                    ledger: Array<{
                        day: number;
                        category: string;
                        name: string;
                        amount: number;
                    }>;
                    costBreakdown: {
                        perDay: number[];
                        total: number;
                        categories: {
                            hotel: number;
                            food: number;
                            activity: number;
                            other: number;
                        };
                    };
                };
                selectedHotel: unknown;
                days: unknown[];
            }>("budget", budgetPayload, authToken, FLOW_SESSION_ID);

            // ── Budget assertions ─────────────────────────────────────────────
            const budget = budgetData.budget;
            expect(budget, "budget object is required").toBeTruthy();
            expect(typeof budget.totalEstimatedCost, "totalEstimatedCost must be number").toBe("number");
            expect(budget.totalEstimatedCost, "totalEstimatedCost must be > 0").toBeGreaterThan(0);
            expect(typeof budget.isOverBudget, "isOverBudget must be boolean").toBe("boolean");

            // Ledger exists and is non-empty
            expect(Array.isArray(budget.ledger) && budget.ledger.length > 0,
                "budget.ledger must be non-empty"
            ).toBe(true);

            // ── INVARIANT: ledger sum === totalEstimatedCost ──────────────────
            const ledgerSum = budget.ledger.reduce((s, item) => s + item.amount, 0);
            expect(
                Math.abs(ledgerSum - budget.totalEstimatedCost),
                `Ledger invariant violated: sum(ledger)=${ledgerSum} !== totalEstimatedCost=${budget.totalEstimatedCost}`
            ).toBeLessThanOrEqual(1); // $1 tolerance for floating-point

            // ── INVARIANT: costBreakdown.total === totalEstimatedCost ─────────
            const breakdown = budget.costBreakdown;
            expect(
                Math.abs(breakdown.total - budget.totalEstimatedCost),
                `CostBreakdown invariant: breakdown.total=${breakdown.total} !== totalEstimatedCost=${budget.totalEstimatedCost}`
            ).toBeLessThanOrEqual(1);

            // ── INVARIANT: sum(categories) === breakdown.total ────────────────
            const categorySum =
                breakdown.categories.hotel +
                breakdown.categories.food +
                breakdown.categories.activity +
                breakdown.categories.other;
            expect(
                Math.abs(categorySum - breakdown.total),
                `Category sum invariant: sum(categories)=${categorySum} !== breakdown.total=${breakdown.total}`
            ).toBeLessThanOrEqual(1);

            // ── INVARIANT: sum(costPerDay) === totalEstimatedCost ─────────────
            const perDaySum = budget.costPerDay.reduce((s, v) => s + v, 0);
            expect(
                Math.abs(perDaySum - budget.totalEstimatedCost),
                `costPerDay invariant: sum(costPerDay)=${perDaySum} !== totalEstimatedCost=${budget.totalEstimatedCost}`
            ).toBeLessThanOrEqual(1);

            // All ledger categories are known values
            const KNOWN_CATEGORIES = new Set(["hotel", "food", "activity", "other"]);
            for (const item of budget.ledger) {
                expect(KNOWN_CATEGORIES.has(item.category),
                    `Unknown ledger category "${item.category}"`
                ).toBe(true);
                expect(item.amount, `Ledger item "${item.name}" has negative amount`).toBeGreaterThanOrEqual(0);
                expect(item.name, `Ledger item missing name on day ${item.day}`).toBeTruthy();
            }

            // If over-budget, budgetGap must be defined and positive
            if (budget.isOverBudget) {
                expect(budget.budgetGap, "budgetGap must be set when isOverBudget=true").toBeDefined();
                expect(budget.budgetGap!, "budgetGap must be > 0").toBeGreaterThan(0);
            }

            console.log(
                `    ✓ total=$${budget.totalEstimatedCost} | hotel=$${breakdown.categories.hotel} | ` +
                `food=$${breakdown.categories.food} | activities=$${breakdown.categories.activity} | ` +
                `other=$${breakdown.categories.other} | overBudget=${budget.isOverBudget}`
            );

            // ── STAGE 5: Safety ───────────────────────────────────────────────
            console.log("[5/6] Safety...");

            const safetyPayload = {
                destination:  budgetData.destination,
                startDate:    plannerData.startDate,
                endDate:      plannerData.endDate,
                durationDays: plannerData.durationDays,
                preferences:  plannerData.preferences,
                days:         budgetData.days,
                hotels:       researchData.hotels,
                selectedHotel: budgetData.selectedHotel,
                budget: {
                    totalEstimatedCost: budget.totalEstimatedCost,
                    costPerDay:         budget.costPerDay,
                    isOverBudget:       budget.isOverBudget,
                    budgetGap:          budget.budgetGap,
                    suggestions:        budget.suggestions,
                },
            };

            const safetyData = await callStage<{
                destination: string;
                durationDays: number;
                days: unknown[];
                selectedHotel: unknown;
                budget: {
                    totalEstimatedCost: number;
                    isOverBudget: boolean;
                };
                safety: {
                    riskLevel: string;
                    warnings: Array<{
                        type: string;
                        day: number;
                        severity: string;
                        message: string;
                    }>;
                    tips: string[];
                };
            }>("safety", safetyPayload, authToken, FLOW_SESSION_ID);

            // ── Safety assertions ─────────────────────────────────────────────
            const safety = safetyData.safety;
            expect(safety, "safety object is required").toBeTruthy();

            expect(["low","medium","high"],
                `safety.riskLevel="${safety.riskLevel}" is not a valid value`
            ).toContain(safety.riskLevel);

            expect(Array.isArray(safety.warnings), "safety.warnings must be array").toBe(true);
            expect(Array.isArray(safety.tips),     "safety.tips must be array").toBe(true);

            // Each warning must be structurally complete
            const VALID_WARNING_TYPES = new Set(["fatigue","travel","schedule","meal"]);
            const VALID_SEVERITIES    = new Set(["medium","high"]);

            for (const w of safety.warnings) {
                expect(VALID_WARNING_TYPES.has(w.type),
                    `warning.type="${w.type}" is invalid`
                ).toBe(true);
                expect(VALID_SEVERITIES.has(w.severity),
                    `warning.severity="${w.severity}" is invalid`
                ).toBe(true);
                expect(w.day,     `warning missing day`).toBeGreaterThan(0);
                expect(w.message, `warning on day ${w.day} has no message`).toBeTruthy();
            }

            // riskLevel must be consistent with warnings present
            if (safety.warnings.some((w) => w.severity === "high")) {
                expect(safety.riskLevel,
                    "riskLevel must be 'high' when a high-severity warning exists"
                ).toBe("high");
            } else if (safety.warnings.length > 0) {
                expect(["medium","high"],
                    "riskLevel must be at least 'medium' when warnings exist"
                ).toContain(safety.riskLevel);
            }

            // Budget preserved through safety stage
            expect(
                safetyData.budget.totalEstimatedCost,
                "Budget total must be unchanged through safety stage"
            ).toBe(budget.totalEstimatedCost);

            console.log(
                `    ✓ riskLevel="${safety.riskLevel}" | ${safety.warnings.length} warning(s) | ${safety.tips.length} tip(s)`
            );

            // ── STAGE 6: Save ─────────────────────────────────────────────────
            console.log("[6/6] Save...");

            const savePayload = {
                tripId: testTripId,
                safetyResult: safetyData,
            };

            const saveData = await callStage<{
                tripId: string;
                itineraryId: string;
            }>("save", savePayload, authToken, FLOW_SESSION_ID);

            // ── Save assertions ───────────────────────────────────────────────
            expect(saveData.tripId, "save.tripId missing").toBeTruthy();
            expect(saveData.itineraryId, "save.itineraryId missing").toBeTruthy();
            expect(saveData.tripId).toBe(testTripId);

            // Verify DB state — trip should be marked completed with correct budget
            const savedTrip = await prisma.trip.findUnique({ where: { id: testTripId } });
            expect(savedTrip, "Trip not found in DB after save").toBeTruthy();
            expect(savedTrip!.status,
                "Trip status must be 'completed' after save"
            ).toBe("completed");
            expect(
                Math.abs(savedTrip!.budgetTotal - budget.totalEstimatedCost),
                `DB budgetTotal=${savedTrip!.budgetTotal} does not match pipeline total=${budget.totalEstimatedCost}`
            ).toBeLessThanOrEqual(1);

            // Verify itinerary record exists
            const savedItinerary = await prisma.itinerary.findFirst({
                where: { tripId: testTripId },
            });
            expect(savedItinerary, "Itinerary row not created in DB").toBeTruthy();
            expect(savedItinerary!.rawJson, "Itinerary rawJson is null").toBeTruthy();

            console.log(
                `    ✓ tripId="${saveData.tripId}" | itineraryId="${saveData.itineraryId}" | status=completed\n`
            );

            // ── Final consistency check ────────────────────────────────────────
            // The destination must be consistent from planner all the way to safety.
            expect(plannerData.destination.toLowerCase())
                .toBe(researchData.destination.toLowerCase());

            expect(logisticsData.destination.toLowerCase())
                .toBe(plannerData.destination.toLowerCase());

            console.log("✅ Full pipeline validated — We validate the full production path end-to-end.");
        },
        // Generous timeout: planner + research involve real LLM calls
        180_000
    );
});
