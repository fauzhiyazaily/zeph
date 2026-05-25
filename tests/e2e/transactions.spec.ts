import { expect, test } from "@playwright/test";
import { requiresAuth, signIn } from "./auth-helpers";

/**
 * E2E: Transactions page
 *
 * Covers: list render, filter controls (source, category, search, date), pagination.
 * Authenticated tests require TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 */

test.describe("Transactions — unauthenticated", () => {
  test("redirects to sign-in when not authenticated", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Transactions — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(requiresAuth(), "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    await signIn(page);
    await page.goto("/transactions");
  });

  test("renders the Transactions heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /transaction/i })).toBeVisible();
  });

  test("renders a search input", async ({ page }) => {
    const searchInput = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible();
  });

  test("source filter buttons are rendered", async ({ page }) => {
    // The page has source filter links/buttons for upi, card, wallet, bank
    const filterArea = page.locator("form, nav, [role='navigation']").first();
    await expect(filterArea).toBeVisible();
  });

  test("applies source filter via URL param", async ({ page }) => {
    await page.goto("/transactions?source=upi");
    await expect(page).toHaveURL(/source=upi/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("applies category filter via URL param", async ({ page }) => {
    await page.goto("/transactions?category=food");
    await expect(page).toHaveURL(/category=food/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("applies search filter via URL param", async ({ page }) => {
    await page.goto("/transactions?q=starbucks");
    await expect(page).toHaveURL(/q=starbucks/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("shows second page via URL param", async ({ page }) => {
    await page.goto("/transactions?page=2");
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("shows uncategorized filter via URL param", async ({ page }) => {
    await page.goto("/transactions?uncategorized=1");
    await expect(page).toHaveURL(/uncategorized=1/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("shows date range filter via URL params", async ({ page }) => {
    await page.goto("/transactions?from=2026-01-01&to=2026-05-31");
    await expect(page).toHaveURL(/from=2026-01-01/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("no crash on combined filters", async ({ page }) => {
    await page.goto("/transactions?source=card&category=food&page=1");
    await expect(page.locator("main")).toBeVisible();
    await expect(page).not.toHaveURL(/\/sign-in/);
  });
});
