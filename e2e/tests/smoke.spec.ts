import { expect, test } from "@playwright/test";

/**
 * Smoke test of the web shell (W1-07) on a 360x740 mobile viewport.
 * Tests what a user sees; data-testid only for the four hooks the frontend agreed to provide:
 * start-case-button, intake-submit, language-switch, case-timeline.
 */

// Each test gets a fresh browser context (empty localStorage), so every test starts in English.

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Claim rejected or only partly paid?");
  await expect(page.getByTestId("start-case-button")).toBeVisible();
  await expect(page.getByText("complaint-filing assistant", { exact: false })).toBeVisible();
});

test("home page fits a 360px screen without horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("language switch changes the page to Hindi", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("language-switch").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("क्लेम रिजेक्ट हुआ या पूरा पैसा नहीं मिला?");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByTestId("start-case-button")).toHaveText(/[ऀ-ॿ]/); // Devanagari

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("क्लेम रिजेक्ट हुआ या पूरा पैसा नहीं मिला?");
});

test("start case leads to the intake form", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-case-button").click();
  await expect(page).toHaveURL(/\/cases\/new$/);
  await expect(page.getByRole("heading", { name: "Tell us about your claim" })).toBeVisible();
  await expect(page.getByTestId("intake-submit")).toBeVisible();
});

test("intake form shows errors when submitted empty", async ({ page }) => {
  await page.goto("/cases/new");
  await page.getByTestId("intake-submit").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/cases\/new$/);
});

test("valid intake reaches a case page showing the timeline", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-case-button").click();

  await page.getByLabel("Insurance company").fill("Sample General Insurance Co. Ltd.");
  await page.getByRole("radio", { name: /Reimbursement/ }).check();
  await page.getByLabel("Claim amount (₹)").fill("184500");
  await page.getByLabel("Date of rejection").fill("2026-03-05");
  await page.getByLabel("What did the insurer say?").fill(
    "Claim repudiated as the ailment is a complication of a pre-existing disease (synthetic test case).",
  );
  await page.getByTestId("intake-submit").click();

  // Next step is adding documents; the user can skip ahead to their case.
  await expect(page).toHaveURL(/\/cases\/[^/]+\/upload$/);
  await expect(page.getByRole("heading", { name: "Add your documents" })).toBeVisible();
  await page.getByRole("link", { name: "Continue to my case" }).click();

  await expect(page).toHaveURL(/\/cases\/[^/]+$/);
  const timeline = page.getByTestId("case-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.getByRole("listitem").first()).toBeVisible();
  // A new case is at the first step ("Details received").
  await expect(timeline.locator('[aria-current="step"]')).toContainText("Details received");
});
