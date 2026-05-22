import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

describe("budgets actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a new budget with normalized category and redirects with success", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    });

    const { upsertBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("category", "Food");
    formData.set("month", "2026-05");
    formData.set("amountLimit", "5000");
    formData.set("returnTo", "/budgets");

    await expect(upsertBudget(formData)).rejects.toThrow("REDIRECT:/budgets?message=Budget%20created.");

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        category: "food",
        month: "2026-05",
        amount_limit: 5000,
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("returns clear duplicate conflict error when create collides", async () => {
    const insertMock = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    });

    const { upsertBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("category", "Food");
    formData.set("month", "2026-05");
    formData.set("amountLimit", "5000");
    formData.set("returnTo", "/budgets");

    await expect(upsertBudget(formData)).rejects.toThrow(
      "REDIRECT:/budgets?error=A%20budget%20already%20exists%20for%20this%20category%20and%20month.%20Edit%20the%20existing%20budget%20instead.",
    );
  });

  it("updates an existing budget and redirects with success", async () => {
    const returnsMock = vi.fn().mockResolvedValue({ data: [{ id: "b1" }], error: null });
    const selectMock = vi.fn().mockReturnValue({ returns: returnsMock });
    const eqUserMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqBudgetMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqBudgetMock });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: updateMock,
      })),
    });

    const { upsertBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("budgetId", "b1");
    formData.set("category", "Food");
    formData.set("month", "2026-05");
    formData.set("amountLimit", "6500");
    formData.set("returnTo", "/budgets");

    await expect(upsertBudget(formData)).rejects.toThrow("REDIRECT:/budgets?message=Budget%20updated.");

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_limit: 6500,
      }),
    );
  });

  it("returns clear error when edited budget is unavailable", async () => {
    const returnsMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const selectMock = vi.fn().mockReturnValue({ returns: returnsMock });
    const eqUserMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqBudgetMock = vi.fn().mockReturnValue({ eq: eqUserMock });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({ eq: eqBudgetMock }),
      })),
    });

    const { upsertBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("budgetId", "missing");
    formData.set("category", "Food");
    formData.set("month", "2026-05");
    formData.set("amountLimit", "6500");
    formData.set("returnTo", "/budgets");

    await expect(upsertBudget(formData)).rejects.toThrow(
      "REDIRECT:/budgets?error=Budget%20could%20not%20be%20updated.%20It%20may%20be%20unavailable.",
    );
  });

  it("sanitizes external returnTo on validation error", async () => {
    const { upsertBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("category", "Food");
    formData.set("month", "2026-05");
    formData.set("amountLimit", "0");
    formData.set("returnTo", "https://evil.example.com");

    await expect(upsertBudget(formData)).rejects.toThrow(
      "REDIRECT:/budgets?error=Budget%20limit%20must%20be%20a%20positive%20number.",
    );
  });

  it("deletes a budget and redirects with success", async () => {
    const deleteEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const deleteEqBudgetMock = vi.fn().mockReturnValue({ eq: deleteEqUserMock });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        delete: vi.fn().mockReturnValue({ eq: deleteEqBudgetMock }),
      })),
    });

    const { deleteBudget } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("budgetId", "b1");
    formData.set("returnTo", "/budgets");

    await expect(deleteBudget(formData)).rejects.toThrow("REDIRECT:/budgets?message=Budget%20deleted.");

    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects alert preference updates when all thresholds are disabled", async () => {
    const { saveBudgetAlertPreferences } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("returnTo", "/budgets");
    formData.set("inAppEnabled", "on");

    await expect(saveBudgetAlertPreferences(formData)).rejects.toThrow(
      "REDIRECT:/budgets?error=Enable%20at%20least%20one%20threshold%20(75%25%20or%20100%25).",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects alert preference updates when all channels are disabled", async () => {
    const { saveBudgetAlertPreferences } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("returnTo", "/budgets");
    formData.set("alert75Enabled", "on");

    await expect(saveBudgetAlertPreferences(formData)).rejects.toThrow(
      "REDIRECT:/budgets?error=Enable%20at%20least%20one%20alert%20channel.",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("saves alert preferences and revalidates budgets and dashboard", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        upsert: upsertMock,
      })),
    });

    const { saveBudgetAlertPreferences } = await import("@/app/budgets/actions");

    const formData = new FormData();
    formData.set("returnTo", "/budgets");
    formData.set("alert75Enabled", "on");
    formData.set("alert100Enabled", "on");
    formData.set("inAppEnabled", "on");
    formData.set("pushEnabled", "on");

    await expect(saveBudgetAlertPreferences(formData)).rejects.toThrow(
      "REDIRECT:/budgets?message=Alert%20preferences%20saved.",
    );

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        alert_75_enabled: true,
        alert_100_enabled: true,
        in_app_enabled: true,
        push_enabled: true,
        email_enabled: false,
      }),
      { onConflict: "user_id" },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });
});
