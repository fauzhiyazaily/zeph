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

describe("goals actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates a goal and redirects with success", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    });

    const { saveGoal } = await import("@/app/goals/actions");
    const formData = new FormData();
    formData.set("name", "Emergency Fund");
    formData.set("targetAmount", "100000");
    formData.set("currentAmount", "25000");
    formData.set("deadline", "2026-12-31");
    formData.set("notes", "Build reserve");
    formData.set("returnTo", "/goals");

    await expect(saveGoal(formData)).rejects.toThrow("REDIRECT:/goals?message=Goal%20saved.");

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        name: "Emergency Fund",
        target_amount: 100000,
        current_amount: 25000,
        deadline: "2026-12-31",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/goals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/goals/history");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("updates a goal in scoped edit flow", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "g1",
        user_id: "u1",
        name: "Emergency Fund",
        target_amount: 120000,
        current_amount: 30000,
        deadline: "2026-12-31",
        notes: null,
        archived_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-05-22T00:00:00.000Z",
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectEqGoalMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });
    const selectMock = vi.fn().mockReturnValue({ eq: selectEqGoalMock });

    const eqUserMock = vi.fn().mockResolvedValue({ error: null });
    const eqGoalMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqGoalMock });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
      })),
    });

    const { saveGoal } = await import("@/app/goals/actions");
    const formData = new FormData();
    formData.set("goalId", "g1");
    formData.set("name", "Emergency Fund");
    formData.set("targetAmount", "120000");
    formData.set("currentAmount", "30000");
    formData.set("deadline", "2026-12-31");
    formData.set("returnTo", "/goals");

    await expect(saveGoal(formData)).rejects.toThrow("REDIRECT:/goals?message=Goal%20saved.");

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target_amount: 120000,
        current_amount: 30000,
      }),
    );
    expect(eqGoalMock).toHaveBeenCalledWith("id", "g1");
    expect(eqUserMock).toHaveBeenCalledWith("user_id", "u1");
  });

  it("rejects immutable field edits for historical goals", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "g1",
        user_id: "u1",
        name: "Emergency Fund",
        target_amount: 120000,
        current_amount: 120000,
        deadline: "2026-12-31",
        notes: "Original note",
        archived_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-05-22T00:00:00.000Z",
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectEqGoalMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });
    const selectMock = vi.fn().mockReturnValue({ eq: selectEqGoalMock });
    const updateMock = vi.fn();

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
      })),
    });

    const { saveGoal } = await import("@/app/goals/actions");
    const formData = new FormData();
    formData.set("goalId", "g1");
    formData.set("name", "Emergency Fund");
    formData.set("targetAmount", "130000");
    formData.set("currentAmount", "120000");
    formData.set("deadline", "2026-12-31");
    formData.set("notes", "Updated note");
    formData.set("returnTo", "/goals/history");

    await expect(saveGoal(formData)).rejects.toThrow(
      "REDIRECT:/goals/history?error=Historical%20goals%20are%20immutable.%20Only%20notes%20can%20be%20updated.",
    );

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows notes-only edits for historical goals", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "g1",
        user_id: "u1",
        name: "Emergency Fund",
        target_amount: 120000,
        current_amount: 120000,
        deadline: "2026-12-31",
        notes: "Original note",
        archived_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-05-22T00:00:00.000Z",
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectEqGoalMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });
    const selectMock = vi.fn().mockReturnValue({ eq: selectEqGoalMock });

    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqGoalMock = vi.fn().mockReturnValue({ eq: updateEqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqGoalMock });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        select: selectMock,
        update: updateMock,
      })),
    });

    const { saveGoal } = await import("@/app/goals/actions");
    const formData = new FormData();
    formData.set("goalId", "g1");
    formData.set("name", "Emergency Fund");
    formData.set("targetAmount", "120000");
    formData.set("currentAmount", "120000");
    formData.set("deadline", "2026-12-31");
    formData.set("notes", "Updated note");
    formData.set("returnTo", "/goals/history");

    await expect(saveGoal(formData)).rejects.toThrow(
      "REDIRECT:/goals/history?message=Goal%20notes%20updated.",
    );

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "Updated note",
      }),
    );
    expect(updateEqGoalMock).toHaveBeenCalledWith("id", "g1");
    expect(updateEqUserMock).toHaveBeenCalledWith("user_id", "u1");
  });

  it("rejects malformed goal data with clear validation errors", async () => {
    const { saveGoal } = await import("@/app/goals/actions");

    const invalidTarget = new FormData();
    invalidTarget.set("name", "Emergency Fund");
    invalidTarget.set("targetAmount", "-1");
    invalidTarget.set("currentAmount", "0");
    invalidTarget.set("deadline", "2026-12-31");
    invalidTarget.set("returnTo", "/goals");

    await expect(saveGoal(invalidTarget)).rejects.toThrow(
      "REDIRECT:/goals?error=Target%20amount%20must%20be%20a%20positive%20number.",
    );

    const invalidDate = new FormData();
    invalidDate.set("name", "Emergency Fund");
    invalidDate.set("targetAmount", "100000");
    invalidDate.set("currentAmount", "0");
    invalidDate.set("deadline", "2026-02-31");
    invalidDate.set("returnTo", "/goals");

    await expect(saveGoal(invalidDate)).rejects.toThrow(
      "REDIRECT:/goals?error=Deadline%20must%20be%20a%20valid%20date.",
    );

    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("sanitizes external returnTo on validation failure", async () => {
    const { saveGoal } = await import("@/app/goals/actions");

    const formData = new FormData();
    formData.set("name", "Emergency Fund");
    formData.set("targetAmount", "0");
    formData.set("currentAmount", "0");
    formData.set("deadline", "2026-12-31");
    formData.set("returnTo", "https://evil.example.com");

    await expect(saveGoal(formData)).rejects.toThrow(
      "REDIRECT:/goals?error=Target%20amount%20must%20be%20a%20positive%20number.",
    );
  });
});
