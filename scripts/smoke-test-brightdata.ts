/**
 * Integration smoke test — Bright Data SERP API
 *
 * Runs the same code path as the production ResearchAgent:
 *   searchAttractions / searchHotels / searchRestaurants
 *
 * Usage:
 *   npx tsx scripts/smoke-test-brightdata.ts
 */

import dotenv from "dotenv";
import { resolve } from "path";

// Load .env from project root
dotenv.config({ path: resolve(process.cwd(), ".env") });

// ─── Minimal inline versions of the production helpers ────────────────────────
// (avoids Next.js / Redis imports so we can run from the CLI)

const BRIGHT_DATA_API_URL = "https://api.brightdata.com/request";
const API_KEY = process.env.BRIGHT_DATA_API_KEY;

interface BrightDataResult {
    title?: string;
    snippet?: string;
    description?: string;
    url?: string;
    rating?: number;
}

interface BrightDataResponse {
    organic?: BrightDataResult[];
    results?: BrightDataResult[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms — ${label}`)), ms)
        ),
    ]);
}

async function queryBrightData(query: string, label: string): Promise<{
    status: "success" | "empty" | "failed";
    count: number;
    sample: string[];
    rawStatus: number;
}> {
    if (!API_KEY) {
        return { status: "failed", count: 0, sample: ["❌ BRIGHT_DATA_API_KEY not set in .env"], rawStatus: 0 };
    }

    const fetchOp = fetch(BRIGHT_DATA_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            zone: "voyageai_serp",
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            format: "raw",
        }),
    });

    const response = await withTimeout(fetchOp, 15_000, label);

    if (!response.ok) {
        return { status: "failed", count: 0, sample: [`HTTP ${response.status}: ${response.statusText}`], rawStatus: response.status };
    }

    const data = (await response.json()) as BrightDataResponse;
    const items: BrightDataResult[] = data.organic ?? data.results ?? [];

    const filtered = items
        .filter(i => !!i.title && !!(i.snippet || i.description))
        .slice(0, 10)
        .map(i => `  • ${i.title}: ${(i.snippet || i.description || "").slice(0, 80)}…`);

    return {
        status: filtered.length > 0 ? "success" : "empty",
        count: filtered.length,
        sample: filtered.slice(0, 3),
        rawStatus: response.status,
    };
}

// ─── Test scenarios (mirrors ResearchAgent queries) ───────────────────────────

const DESTINATION = "Tokyo";

const scenarios = [
    {
        label: "Attractions",
        query: `top rated things to do in ${DESTINATION} for 5 days cultural travel`,
    },
    {
        label: "Hotels",
        query: `best mid-range hotels in ${DESTINATION} guest favorite highly rated`,
    },
    {
        label: "Restaurants",
        query: `best local restaurants in ${DESTINATION} highly rated`,
    },
];

// ─── Run ──────────────────────────────────────────────────────────────────────

async function run() {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(" VoyageAI × Bright Data — Integration Smoke Test");
    console.log("════════════════════════════════════════════════════════════");
    console.log(` Destination : ${DESTINATION}`);
    console.log(` API key     : ${API_KEY ? API_KEY.slice(0, 8) + "…" : "NOT SET"}`);
    console.log(` Endpoint    : ${BRIGHT_DATA_API_URL}`);
    console.log("────────────────────────────────────────────────────────────\n");

    let allPassed = true;

    for (const { label, query } of scenarios) {
        process.stdout.write(`▶ ${label.padEnd(14)} `);
        const start = Date.now();

        try {
            const result = await queryBrightData(query, label);
            const ms = Date.now() - start;

            const icon = result.status === "success" ? "✅" : result.status === "empty" ? "⚠️ " : "❌";
            console.log(`${icon} ${result.status.toUpperCase().padEnd(8)} | ${result.count} results | ${ms}ms | HTTP ${result.rawStatus}`);

            if (result.sample.length > 0) {
                result.sample.forEach(s => console.log(`   ${s}`));
            }

            if (result.status !== "success") allPassed = false;
        } catch (err: any) {
            const ms = Date.now() - start;
            console.log(`❌ ERROR      | ${ms}ms | ${err.message}`);
            allPassed = false;
        }

        console.log();
    }

    console.log("════════════════════════════════════════════════════════════");
    if (allPassed) {
        console.log(" ✅ ALL CHECKS PASSED — Bright Data integration is healthy");
    } else {
        console.log(" ❌ SOME CHECKS FAILED — review output above");
        process.exit(1);
    }
    console.log("════════════════════════════════════════════════════════════\n");
}

run().catch(err => {
    console.error("Unhandled error:", err);
    process.exit(1);
});
