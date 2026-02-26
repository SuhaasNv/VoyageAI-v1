/**
 * Verifies cache key normalization. Run: npx tsx scripts/verify-cache-key-normalization.ts
 */

function normalizeDestination(destination: string): string {
    return (
        destination
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "travel"
    );
}

const CACHE_PREFIX = "destination-image:";

function key(d: string) {
    return `${CACHE_PREFIX}${normalizeDestination(d)}`;
}

const dubaiCases = ["  Dubai ", "dubai", "DuBaI"];
const abuDhabiCases = ["Abu  Dhabi", "Abu Dhabi", " ABU  DHABI "];

const dubaiKeys = dubaiCases.map(key);
const abuDhabiKeys = abuDhabiCases.map(key);

const dubaiOk = new Set(dubaiKeys).size === 1;
const abuDhabiOk = new Set(abuDhabiKeys).size === 1;

console.log("Dubai cases:", dubaiCases.map((c) => `"${c}"`).join(", "));
console.log("  → keys:", dubaiKeys);
console.log("  → same key:", dubaiOk ? "✅" : "❌");

console.log("\nAbu Dhabi cases:", abuDhabiCases.map((c) => `"${c}"`).join(", "));
console.log("  → keys:", abuDhabiKeys);
console.log("  → same key:", abuDhabiOk ? "✅" : "❌");

process.exit(dubaiOk && abuDhabiOk ? 0 : 1);
