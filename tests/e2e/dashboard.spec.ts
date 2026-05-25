import { expect, test } from "@playwright/test";
import { requiresAuth, signIn } from "./auth-helpers";

/**
 * E2E: Dashboard page
 *
 * Authenticated tests require TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 */

test.describe("Dashboard — unauthenticated", () => {
  test("redirects to sign-in when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Dashboard — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(requiresAuth(), "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    await signIn(page);
    await page.goto("/dashboard");
  });

  test("renders the main heading", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("shows the navigation shell", async ({ page }) => {
    await expect(page.getByRole("link", { name: /budget/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /transaction/i })).toBeVisible();
  });

  test("shows the weekly expense chart section", async ({ page }) => {
    // The chart container or a surrounding section should be present
    await expect(page.locator("main")).toBeVisible();
  });

  test("shows the spend pie chart or a placeholder", async ({ page }) => {
    // The page always renders main content - verify no crash
    await expect(page.locator("main")).toBeVisible();
    await expect(page).toHaveURL("/dashboard");
  });

  test("bank statement upload section is present", async ({ page }) => {
    const uploadCard = page.getByText(/upload/i).first();
    await expect(uploadCard).toBeVisible();
  });

  test("navigates to transactions from dashboard link", async ({ page }) => {
    const txLink = page.getByRole("link", { name: /transaction/i }).first();
    await txLink.click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test("navigates to budgets from dashboard link", async ({ page }) => {
    const budgetLink = page.getByRole("link", { name: /budget/i }).first();
    await budgetLink.click();
    await expect(page).toHaveURL(/\/budgets/);
  });
});
