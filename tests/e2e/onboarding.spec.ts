import { expect, test } from "@playwright/test";
import { requiresAuth, signIn } from "./auth-helpers";

/**
 * E2E: Onboarding consent page
 *
 * Covers: redirect when unauthenticated, page render when authenticated.
 * Authenticated tests require TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 */

test.describe("Onboarding consent — unauthenticated", () => {
  test("redirects to sign-in preserving the ?next param", async ({ page }) => {
    await page.goto("/onboarding/consent");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page).toHaveURL(/next=%2Fonboarding%2Fconsent/);
  });
});

test.describe("Onboarding consent — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(requiresAuth(), "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
    await signIn(page);
    await page.goto("/onboarding/consent");
  });

  test("renders without crashing", async ({ page }) => {
    await expect(page.locator("main, body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test("page URL remains on /onboarding/consent", async ({ page }) => {
    await expect(page).toHaveURL(/\/onboarding\/consent/);
  });
});
