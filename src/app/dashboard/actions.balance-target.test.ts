import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const revalidatePathMock = vi.fn();
const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

describe("balance target actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects oversized balance target values with a clear validation message", async () => {
    const { setBalanceTarget } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("balance_target", "10000000000");

    await expect(setBalanceTarget(formData)).resolves.toEqual({
      error: "Balance target value is too large.",
    });

    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("persists valid balance targets and revalidates dashboard", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        upsert: upsertMock,
      })),
    });

    const { setBalanceTarget } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("balance_target", "250000");

    await expect(setBalanceTarget(formData)).resolves.toEqual({ error: null });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        balance_target: 250000,
      }),
      { onConflict: "user_id" },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("clears custom balance target to restore auto-computed mode", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({
      eq: eqMock,
    });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: updateMock,
      })),
    });

    const { clearBalanceTarget } = await import("@/app/dashboard/actions");

    await expect(clearBalanceTarget()).resolves.toEqual({ error: null });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        balance_target: null,
      }),
    );
    expect(eqMock).toHaveBeenCalledWith("user_id", "u1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });
});
