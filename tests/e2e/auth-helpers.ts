import { type Page, expect } from "@playwright/test";

/**
 * Signs in using TEST_USER_EMAIL / TEST_USER_PASSWORD env vars.
 * Returns true if sign-in succeeded, false if credentials are not configured.
 *
 * Usage:
 *   test.beforeEach(async ({ page }) => {
 *     await signIn(page);
 *   });
 */
export async function signIn(page: Page): Promise<boolean> {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    return false;
  }

  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for redirect away from sign-in
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 10_000 });
  return true;
}

/** Returns true when credentials are NOT configured (use with test.skip). */
export function requiresAuth(): boolean {
  return !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;
}
