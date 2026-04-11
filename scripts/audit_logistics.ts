import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { LogisticsAgent } from "../src/agents/logistics/logisticsAgent";
import { EnrichedTripContext, Activity, HotelOption } from "../src/agents/shared/tripPipelineTypes";

function expect(condition: boolean, msg: string) {
    if (!condition) {
        throw new Error("Assertion failed: " + msg);
    }
}

async function runAudit() {
    console.log("🚀 Starting Logistics Agent Audit");
    const agent = new LogisticsAgent();

    // Base coords
    const hotelLat = 40.7580; // Times Square
    const hotelLng = -73.9855;
    const momaLat = 40.7614; const momaLng = -73.9776; // Near
    const esbLat = 40.7484; const esbLng = -73.9857; // Med
    const batteryLat = 40.7033; const batteryLng = -74.0170; // Far

    const hotel: HotelOption = {
        name: "Times Square Hotel",
        priceRange: "$$",
        area: "Midtown",
        tags: [],
        lat: hotelLat,
        lng: hotelLng
    };

    const baseContext: EnrichedTripContext = {
        destination: "New York",
        startDate: "2024-05-01",
        endDate: "2024-05-02",
        durationDays: 2,
        hotels: [hotel],
        preferences: { pace: "medium" },
        days: []
    };

    const basicActivities: Activity[] = [
        { name: "Battery Park", type: "experience", description: "Park", lat: batteryLat, lng: batteryLng },
        { name: "MoMA", type: "attraction", description: "Art", lat: momaLat, lng: momaLng },
        { name: "Empire State", type: "attraction", description: "View", lat: esbLat, lng: esbLng }
    ];

    const ctx1: EnrichedTripContext = {
        ...baseContext,
        days: [{ day: 1, theme: "Explore", activities: basicActivities }]
    };

    // ----------------------------------------------------
    // We will fake Mapbox fetch to allow cache tests
    // ----------------------------------------------------
    const originalFetch = global.fetch;
    let fetchCallCount = 0;
    let fetchMode = "success"; // 'success' or 'error'
    
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlString = url.toString();
        if (urlString.includes("directions-matrix")) {
            fetchCallCount++;
            if (fetchMode === "error") {
                return new Response("Simulated API Error", { status: 500, statusText: "Internal Server Error" });
            }
            // Return fake matrix (4x4)
            const size = urlString.split(";").length; 
            const fakeMatrix = Array(size).fill(0).map((_, i) => Array(size).fill(0).map((_, j) => i === j ? 0 : 300));
            return new Response(JSON.stringify({ durations: fakeMatrix }), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }
        return originalFetch(url, init);
    };

    // ======================================
    // Test 1: Basic Functionality & Time Realism
    // ======================================
    console.log("\n--- STEP 1 & 4: Basic functionality & Time realism ---");
    fetchMode = "success";
    const startTime1 = Date.now();
    const res1 = await agent.run(ctx1, "audit-1");
    const timeFirstRun = Date.now() - startTime1;
    
    const actsDay1 = res1.days[0].activities;
    
    expect(actsDay1.length === 3, "Output should have 3 scheduled activities");
    expect(res1.selectedHotel.name === hotel.name, "Hotel selected incorrectly");
    
    actsDay1.forEach(act => {
        expect(!!act.startTime, "Missing startTime: " + act.name);
        expect(!!act.endTime, "Missing endTime: " + act.name);
        expect(act.travelTimeFromPrevMs !== undefined, "Missing travelTimeFromPrevMs: " + act.name);
    });

    const firstAct = actsDay1[0];
    const startsAt9 = firstAct.startTime?.startsWith("09:");
    expect(!!startsAt9, "Day doesn't start at 09:xx but starts at " + firstAct.startTime);
    
    console.log("✅ Basic functionality passed");
    console.log("✅ Time realism passed");

    // ======================================
    // Test 2: Routing Correctness (Nearest neighbor)
    // ======================================
    console.log("\n--- STEP 2: Routing correctness ---");
    
    const names = actsDay1.map(a => a.name);
    console.log("Visiting order with mocked equal-distant mapbox matrix:", names);
    console.log("✅ Routing correctness will be verified structurally using Haversine calculation later.");

    // ======================================
    // Test 7 & 10: Mapbox Behavior & Cache Performance
    // ======================================
    console.log("\n--- STEP 7 & 10: Matrix cache & Performance ---");
    const startTime2 = Date.now();
    const resCached = await agent.run(ctx1, "audit-cached");
    const timeCachedRun = Date.now() - startTime2;
    
    console.log(`First run latency: ${timeFirstRun}ms`);
    console.log(`Cached run latency: ${timeCachedRun}ms`);
    
    expect(timeCachedRun < 500, "Cached run latency should be small, took: " + timeCachedRun + "ms");
    expect(fetchCallCount === 1, "Should have used cache instead of calling fetch again");
    console.log("✅ Mapbox behavior & Performance bounds verified");

    // ======================================
    // Test 5: Overflow Handling
    // ======================================
    console.log("\n--- STEP 5: Overflow handling ---");
    
    const overflowActivities: Activity[] = [];
    for(let i=0; i<15; i++) {
        overflowActivities.push({
            name: `Act ${i}`, type: "experience", description: "Overflow", lat: momaLat + i*0.0001, lng: momaLng
        });
    }

    const ctxOverflow: EnrichedTripContext = {
        ...baseContext,
        preferences: { pace: "fast" }, // cap=5
        days: [{ day: 1, theme: "Overflow", activities: overflowActivities }]
    };

    const resOverflow = await agent.run(ctxOverflow, "audit-5");
    const overflowDay1 = resOverflow.days[0].activities;
    
    expect(overflowDay1.length <= 5, "Did not cap based on pace. Length=" + overflowDay1.length);
    console.log(`Scheduled ${overflowDay1.length} activities (capped).`);
    
    const lastAct = overflowDay1[overflowDay1.length - 1];
    const endTotal = parseInt(lastAct.endTime!.split(":")[0]) * 60 + parseInt(lastAct.endTime!.split(":")[1]);
    expect(endTotal <= 19 * 60, `Exceeded 19:00 limit, ended at ${lastAct.endTime}`);
    console.log("✅ Overflow handling passed");

    // ======================================
    // Test 6 & 9: Edge cases & Data Integrity
    // ======================================
    console.log("\n--- STEP 6 & 9: Edge cases & Data integrity ---");
    const edgeCtx: EnrichedTripContext = {
        ...baseContext,
        days: [{ day: 1, theme: "Edge", activities: [
            { name: "Single, Missing Coords", type: "attraction", description: "" },
            { name: "Zero Coords", type: "attraction", description: "", lat: 0, lng: 0 }
        ]}]
    };
    
    const resEdge = await agent.run(edgeCtx, "audit-6");
    const actsEdge = resEdge.days[0].activities;
    expect(actsEdge.length === 2, "Should handle missing/zero coords.");
    console.log("✅ Edge cases & Data integrity passed");

    // ======================================
    // Test 8: Mapbox Fallback Validation (And test 2 routing)
    // ======================================
    console.log("\n--- STEP 8: Fallback validation & STEP 2 Routing Correctness ---");
    fetchMode = "error"; 
    
    // Give brand new coords so it doesn't hit cache
    const fallbackCtx = {
        ...baseContext,
        days: [{ day: 1, theme: "Fallback", activities: basicActivities.map(a => ({...a, lat: a.lat! + 0.1, lng: a.lng! + 0.1})) }]
    }

    const resFallback = await agent.run(fallbackCtx, "audit-8");
    const fallbackActs = resFallback.days[0].activities;
    expect(fallbackActs.length === 3, "Fallback failed to produce itinerary");
    expect(fallbackActs[1].travelTimeFromPrevMs !== undefined, "Travel time shouldn't be undefined");
    
    const namesFallback = fallbackActs.map(a => a.name);
    console.log("Visiting order (Haversine fallback):", namesFallback);
    expect(namesFallback[0] === "MoMA", "Should start with MoMA");
    expect(namesFallback[1] === "Empire State", "Then Empire State");
    expect(namesFallback[2] === "Battery Park", "Then Battery Park");
    
    global.fetch = originalFetch;
    console.log("✅ Routing correctness passed");
    console.log("✅ Fallback validation passed");

    console.log("\n🎉 ALL TESTS COMPLETED.");
}

runAudit().catch(err => {
    console.error("❌ Audit failed:", err);
    process.exit(1);
});
