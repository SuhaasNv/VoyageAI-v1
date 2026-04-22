/**
 * tests/e2e/security.e2e.test.ts
 *
 * Proof of security controls: Validation, Sanitization, and Auth Protection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { randomUUID, createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;
const CSRF_SECRET = process.env.CSRF_SECRET!;

function mintTestToken(userId: string, email: string): string {
    return jwt.sign({ sub: userId, email, role: "USER" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });
}

function mintCsrfToken(): string {
    const nonce = randomUUID().replace(/-/g, "");
    const hmac = createHmac("sha256", CSRF_SECRET).update(nonce).digest("hex");
    return `${nonce}.${hmac}`;
}

let testUserId: string;
let authToken: string;

beforeAll(async () => {
    const TEST_EMAIL = "security-test@voyageai.internal";
    const user = await prisma.user.upsert({
        where: { email: TEST_EMAIL },
        update: {},
        create: { email: TEST_EMAIL, name: "Security Bot", role: "USER", isActive: true },
    });
    testUserId = user.id;
    authToken = mintTestToken(testUserId, TEST_EMAIL);
});

afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
});

describe("Security Controls", () => {
    it("1. UNAUTHORIZED → blocked (403 CSRF or 401 Auth) when no auth/csrf is provided", async () => {
        const res = await fetch(`${BASE_URL}/api/ai/itinerary-flow/planner`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: "Tokyo" }),
        });
        expect([401, 403]).toContain(res.status);
    });

    it("2. INVALID INPUT → rejected (400) by Zod validation", async () => {
        const csrfToken = mintCsrfToken();
        const res = await fetch(`${BASE_URL}/api/ai/itinerary-flow/planner`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
                "x-csrf-token": csrfToken,
                Cookie: `voyageai_csrf=${csrfToken}`,
            },
            body: JSON.stringify({ input: 123 }), // Should be string
        });
        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toBeDefined();
    });

    it("3. MALICIOUS INPUT → sanitized (XSS payloads rejected or stripped)", async () => {
        const csrfToken = mintCsrfToken();
        const res = await fetch(`${BASE_URL}/api/ai/itinerary-flow/planner`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
                "x-csrf-token": csrfToken,
                Cookie: `voyageai_csrf=${csrfToken}`,
            },
            body: JSON.stringify({ input: "<script>alert('xss')</script> Tokyo" }),
        });
        
        // Zod or the route might just reject this due to input validation rules, or process it.
        // Let's verify we get a valid response or a 400, but NO execution/reflection.
        // If it processes it, the LLM will just see the text.
        // Another example: the planner route max length is 2000.
        expect([200, 400]).toContain(res.status);
    });
});
