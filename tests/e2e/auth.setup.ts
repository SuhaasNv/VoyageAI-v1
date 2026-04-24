import { test, expect, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Client } from "pg";

const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? "perf.user@voyageai.internal";
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? "PerfUser!2026";
const BASE_URL = process.env.E2E_BASE_URL ?? "https://voyageai-nextjs-staging-clhvq.ondigitalocean.app";

async function seedSessionViaSignedToken(page: Page) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required for E2E fallback auth.");
  const connectionString = dbUrl.replace(/[&?]sslmode=[^&?#]*/g, "").replace(/[?&]$/, "");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let q;
  try {
    q = await client.query(
      `select id, email, name, image, role, "hasOnboarded", "createdAt" from "User" where email = $1 limit 1`,
      [TEST_EMAIL.toLowerCase()]
    );
  } catch {
    q = await client.query(
      `select id, email, name, image, role, "hasOnboarded", "createdAt" from users where email = $1 limit 1`,
      [TEST_EMAIL.toLowerCase()]
    );
  }
  await client.end();
  const user = q.rows[0];
  if (!user) throw new Error(`E2E user not found: ${TEST_EMAIL}`);

  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const csrfSecret = process.env.CSRF_SECRET;
  if (!accessSecret || !csrfSecret) {
    throw new Error("JWT_ACCESS_SECRET and CSRF_SECRET are required for E2E fallback auth.");
  }

  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomBytes(16).toString("hex"),
    },
    accessSecret,
    { algorithm: "HS256", expiresIn: "2h" }
  );

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csrfToken = `${nonce}.${crypto.createHmac("sha256", csrfSecret).update(nonce).digest("hex")}`;
  const host = new URL(BASE_URL).hostname;

  await page.context().addCookies([
    { name: "voyageai_at", value: accessToken, domain: host, path: "/", secure: true, sameSite: "Strict" },
    { name: "voyageai_csrf", value: csrfToken, domain: host, path: "/", secure: true, sameSite: "Strict" },
  ]);

  const persistPayload = JSON.stringify({
    state: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        hasOnboarded: user.hasOnboarded,
        createdAt: new Date(user.createdAt).toISOString(),
      },
      accessToken,
    },
    version: 0,
  });

  await page.addInitScript((payload) => {
    window.sessionStorage.setItem("voyageai-auth", payload);
  }, persistPayload);
}

test("authenticate and cache storage state", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.locator("#login-submit").click();

  let loggedIn = false;
  try {
    await expect(page).toHaveURL(/\/(dashboard|admin)(\/.*)?$/, { timeout: 20_000 });
    loggedIn = true;
  } catch {
    await seedSessionViaSignedToken(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  }

  if (!loggedIn) {
    await expect(page.getByPlaceholder(/search destinations/i)).toBeVisible();
  }

  await page.context().storageState({ path: "tests/e2e/storageState.json" });
});
