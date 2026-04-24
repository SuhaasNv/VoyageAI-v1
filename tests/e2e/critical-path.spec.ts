import { test, expect, type Page } from "@playwright/test";

const runId = Date.now().toString().slice(-6);
const city = runId.endsWith("0") || runId.endsWith("2") || runId.endsWith("4") || runId.endsWith("6") || runId.endsWith("8")
  ? "Dubai, UAE"
  : "Singapore";
const destination = `${city} QA ${runId}`;
const today = new Date();
const start = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 21);
const end = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 23);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

let createdTripPath = "";
let sharedPublicUrl = "";

async function dismissOnboardingIfPresent(page: Page) {
  const modalHeading = page.getByRole("heading", { name: /welcome! set your preferences/i });
  if (await modalHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /culture|adventure|relaxation/i }).first().click();
    await page.getByRole("button", { name: /balanced|slow & relaxed|packed & active/i }).first().click();
    await page.getByRole("button", { name: /mid-range|budget|luxury/i }).first().click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(modalHeading).toBeHidden({ timeout: 20_000 });
  }
}

test.describe.serial("Critical end-to-end user flow", () => {
  test("dashboard loads and trips area is visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await dismissOnboardingIfPresent(page);
    await expect(page.getByPlaceholder(/search destinations/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /active trips/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^start$/i })).toBeVisible();
  });

  test("create trip and run planner→research→logistics→budget→safety", async ({ page }) => {
    await page.goto("/dashboard");
    await dismissOnboardingIfPresent(page);

    await page.locator("button:has(svg.lucide-plus)").first().click();
    await expect(page.getByRole("heading", { name: /create new trip/i })).toBeVisible();

    await page.getByPlaceholder(/tokyo, japan/i).fill(destination);
    await page.locator("input[type='date']").nth(0).fill(fmt(start));
    await page.locator("input[type='date']").nth(1).fill(fmt(end));
    await page.getByRole("button", { name: /generate itinerary/i }).click();

    await expect(page.getByRole("button", { name: /this plan looks good/i })).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: /this plan looks good/i }).click();

    await expect(page.getByRole("button", { name: /love this plan/i })).toBeVisible({ timeout: 300_000 });
    await page.getByRole("button", { name: /love this plan/i }).click();

    await expect(page.getByRole("button", { name: /route is optimized/i })).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: /route is optimized/i }).click();

    await expect(page.getByRole("button", { name: /budget approved/i })).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: /budget approved/i }).click();

    await expect(page.getByText(/safety briefing & final review/i)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/grand total/i)).toBeVisible();
    await expect(page.locator("text=/\\$\\d+/").first()).toBeVisible();

    await page.getByRole("button", { name: /save my trip/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/trip\//, { timeout: 90_000 });
    createdTripPath = new URL(page.url()).pathname;
  });

  test("saved trip appears and share link works publicly", async ({ browser, page }) => {
    if (!createdTripPath) test.skip();
    await page.goto(createdTripPath);
    const shareButton = page.getByRole("button", { name: /^share$/i });
    await expect(shareButton).toBeVisible({ timeout: 60_000 });

    await shareButton.click();
    await expect(page.getByRole("button", { name: /generate share link/i })).toBeVisible();
    await page.getByRole("button", { name: /generate share link/i }).click();

    const preview = page.getByRole("link", { name: /preview share page/i });
    await expect(preview).toBeVisible({ timeout: 30_000 });
    sharedPublicUrl = (await preview.getAttribute("href")) ?? "";
    expect(sharedPublicUrl).toContain("/share/");

    const anon = await browser.newContext();
    const publicPage = await anon.newPage();
    await publicPage.goto(sharedPublicUrl);
    await expect(publicPage).toHaveURL(/\/share\//);
    await expect(publicPage.getByText(/ai-crafted itinerary/i)).toBeVisible();
    await expect(publicPage.getByRole("heading", { level: 1 })).toBeVisible();
    await anon.close();
  });
});
