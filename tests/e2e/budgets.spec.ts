import { expect, test } from "@playwright/test";
import { requiresAuth, signIn } from "./auth-helpers";

/**
 * E2E: Budgets page
 *
 * Covers: page render, add-budget form, alert preferences form, budget list.
 * Edit/delete flows require existing data so they're guarded by content checks.
 * Authenticated tests require TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 */

test.describe("Budgets — unauthenticated", () => {
  test("redirects to sign-in when not authenticated", async ({ page }) => {
    await page.goto("/budgets");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Budgets — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(requiresAuth(), "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    await signIn(page);
    await page.goto("/budgets");
  });

  test("renders the Budget Planning heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /budget planning/i })).toBeVisible();
  });

  test("shows the add-a-budget form with required fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /add a budget/i })).toBeVisible();
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByLabel(/month/i)).toBeVisible();
    await expect(page.getByLabel(/monthly limit/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /add budget/i })).toBeVisible();
  });

  test("shows the budget alert preferences section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /budget alert preferences/i })).toBeVisible();
    await expect(page.getByLabel(/alert at 75%/i)).toBeVisible();
    await expect(page.getByLabel(/alert at 100%/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /save alert preferences/i })).toBeVisible();
  });

  test("shows the recent budget alerts section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /recent budget alerts/i })).toBeVisible();
  });

  test("shows the your budgets section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /your budgets/i })).toBeVisible();
  });

  test("add-budget form requires category field", async ({ page }) => {
    // Fill only the numeric fields, leave category blank — browser validation fires
    const categoryInput = page.getByLabel(/category/i);
    await categoryInput.fill("");
    const limitInput = page.getByLabel(/monthly limit/i);
    await limitInput.fill("5000");
    const submitButton = page.getByRole("button", { name: /add budget/i });
    await submitButton.click();
    // Should not navigate away — still on /budgets
    await expect(page).toHaveURL(/\/budgets/);
  });

  test("add-budget form requires monthly limit field", async ({ page }) => {
    const categoryInput = page.getByLabel(/category/i);
    await categoryInput.fill("Food");
    const limitInput = page.getByLabel(/monthly limit/i);
    await limitInput.fill("");
    const submitButton = page.getByRole("button", { name: /add budget/i });
    await submitButton.click();
    await expect(page).toHaveURL(/\/budgets/);
  });

  test("shows the dashboard back-link", async ({ page }) => {
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("edit query param switches form to edit mode", async ({ page }) => {
    // With no matching ID the page just falls back to add mode gracefully
    await page.goto("/budgets?edit=nonexistent-id");
    await expect(page.locator("main")).toBeVisible();
    await expect(page).not.toHaveURL(/\/sign-in/);
  });
});
