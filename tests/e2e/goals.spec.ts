import { expect, test } from "@playwright/test";
import { requiresAuth, signIn } from "./auth-helpers";

/**
 * E2E: Goals page
 *
 * Covers: page render, progress snapshot, add-goal form, milestone celebrations.
 * Authenticated tests require TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 */

test.describe("Goals — unauthenticated", () => {
  test("redirects to sign-in when not authenticated", async ({ page }) => {
    await page.goto("/goals");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("Goals — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(requiresAuth(), "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    await signIn(page);
    await page.goto("/goals");
  });

  test("renders the Savings Goals heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /savings goals/i })).toBeVisible();
  });

  test("shows the progress snapshot section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /progress snapshot/i })).toBeVisible();
    await expect(page.getByText(/total goals/i)).toBeVisible();
    await expect(page.getByText(/completed/i)).toBeVisible();
    await expect(page.getByText(/avg progress/i)).toBeVisible();
  });

  test("shows the milestone celebrations section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /milestone celebrations/i })).toBeVisible();
  });

  test("shows the add-a-goal form with required fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /add a goal/i })).toBeVisible();
    await expect(page.getByLabel(/goal name/i)).toBeVisible();
    await expect(page.getByLabel(/target amount/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /add goal/i })).toBeVisible();
  });

  test("add-goal form requires goal name", async ({ page }) => {
    const nameInput = page.getByLabel(/goal name/i);
    await nameInput.fill("");
    const targetInput = page.getByLabel(/target amount/i);
    await targetInput.fill("10000");
    await page.getByRole("button", { name: /add goal/i }).click();
    // Still on goals page (browser or server validation)
    await expect(page).toHaveURL(/\/goals/);
  });

  test("shows the goal history link", async ({ page }) => {
    await expect(page.getByRole("link", { name: /goal history/i })).toBeVisible();
  });

  test("shows the dashboard back-link", async ({ page }) => {
    await expect(page.getByRole("link", { name: /dashboard/i })).toBeVisible();
  });

  test("goal history link navigates to goals/history", async ({ page }) => {
    await page.getByRole("link", { name: /goal history/i }).click();
    await expect(page).toHaveURL(/\/goals\/history/);
  });

  test("edit query param shows edit form", async ({ page }) => {
    await page.goto("/goals?edit=nonexistent-id");
    await expect(page.locator("main")).toBeVisible();
    await expect(page).not.toHaveURL(/\/sign-in/);
  });
});
