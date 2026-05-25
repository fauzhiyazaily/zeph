import { expect, test } from "@playwright/test";

/**
 * E2E: Protected route redirects
 *
 * Verifies that unauthenticated users are redirected to /sign-in
 * for every route that requires authentication.
 */

const protectedRoutes = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/transactions", label: "Transactions" },
  { path: "/budgets", label: "Budgets" },
  { path: "/goals", label: "Goals" },
  { path: "/chat", label: "Chat" },
  { path: "/settings/privacy", label: "Privacy settings" },
  { path: "/onboarding/consent", label: "Consent onboarding" },
];

for (const { path, label } of protectedRoutes) {
  test(`${label} (${path}) redirects unauthenticated users to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

test("sign-in redirect preserves the intended destination via ?next param", async ({ page }) => {
  await page.goto("/settings/privacy");
  await expect(page).toHaveURL(/next=%2Fsettings%2Fprivacy/);
});

test("sign-in redirect for consent onboarding preserves destination", async ({ page }) => {
  await page.goto("/onboarding/consent");
  await expect(page).toHaveURL(/next=%2Fonboarding%2Fconsent/);
});
