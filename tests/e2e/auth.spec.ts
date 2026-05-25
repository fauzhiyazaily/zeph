import { expect, test } from "@playwright/test";

/**
 * E2E: Authentication flows
 *
 * These tests run against the live dev server (http://localhost:3000 by default).
 * Set PLAYWRIGHT_BASE_URL to override.
 *
 * For authenticated tests, set:
 *   TEST_USER_EMAIL    — a valid Supabase test account email
 *   TEST_USER_PASSWORD — the account password
 */

test.describe("Sign-in page", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /continue to zeph/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows validation error for invalid email format", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("not-an-email");
    await page.getByLabel(/password/i).fill("anypassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Server redirects back with error query param
    await expect(page).toHaveURL(/error=/);
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("wrong@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/error=/);
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("has a link to the sign-up page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });
});

test.describe("Sign-up page", () => {
  test("renders the sign-up form", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();
  });
});
