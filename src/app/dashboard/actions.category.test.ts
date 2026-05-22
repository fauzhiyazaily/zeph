import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const revalidatePathMock = vi.fn();
const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const logAuditEventMock = vi.fn();

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

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

describe("dashboard category assignment actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("assignTransactionCategory updates category and redirects to returnTo with success", async () => {
    const updateBuilder = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => updateBuilder),
      })),
    });

    const { assignTransactionCategory } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("category", "Food");
    formData.set("returnTo", "/transactions");

    await expect(assignTransactionCategory(formData)).rejects.toThrow(
      "REDIRECT:/transactions?message=Category%20updated.",
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/transactions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
  });

  it("assignTransactionCategory defaults to dashboard return path for in-panel quick actions", async () => {
    const updateBuilder = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => updateBuilder),
      })),
    });

    const { assignTransactionCategory } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("category", "Food");

    await expect(assignTransactionCategory(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=Category%20updated.",
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/transactions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
  });

  it("bulkAssignTransactionCategory applies scoped updates and redirects with warning when rows are skipped", async () => {
    const selectBuilder = {
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          returns: vi.fn().mockResolvedValue({
            data: [{ id: "tx-1" }],
            error: null,
          }),
        }),
      }),
    };

    const updateBuilder = {
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const fromMock = vi.fn(() => {
      if (fromMock.mock.calls.length === 1) {
        return {
          select: vi.fn(() => selectBuilder),
        };
      }

      return {
        update: vi.fn(() => updateBuilder),
      };
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { bulkAssignTransactionCategory } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("category", "Groceries");
    formData.set("transactionIds", "tx-1");
    formData.append("transactionIds", "tx-2");
    formData.set("returnTo", "/transactions");

    await expect(bulkAssignTransactionCategory(formData)).rejects.toThrow(
      /^REDIRECT:\/transactions\?warning=/,
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "transactions_bulk_category_updated",
        userId: "u1",
        metadata: expect.objectContaining({
          updatedCount: 1,
          skippedCount: 1,
          category: "Groceries",
        }),
      }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/transactions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
  });

  it("bulkAssignTransactionCategory blocks updates when no selected rows are in scope", async () => {
    const selectBuilder = {
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          returns: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    };

    const updateMock = vi.fn();
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => selectBuilder),
        update: updateMock,
      })),
    });

    const { bulkAssignTransactionCategory } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("category", "Bills");
    formData.append("transactionIds", "tx-out-of-scope");
    formData.set("returnTo", "/transactions");

    await expect(bulkAssignTransactionCategory(formData)).rejects.toThrow(
      "REDIRECT:/transactions?error=No%20selected%20transactions%20belong%20to%20your%20account.%20Refresh%20and%20try%20again.",
    );

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("editTransactionDetails returns scoped partial-failure message when no row is updated", async () => {
    const selectMock = vi.fn().mockReturnValue({
      returns: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
    const eqUserMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const eqIdMock = vi.fn().mockReturnValue({
      eq: eqUserMock,
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: eqIdMock,
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: updateMock,
      })),
    });

    const { editTransactionDetails } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("merchant", "Cafe Nero");
    formData.set("amount", "120");
    formData.set("source", "card");
    formData.set("reference", "ref-1");
    formData.set("category", "Food");
    formData.set("date", "2026-05-22T10:30");
    formData.set("returnTo", "/transactions");

    await expect(editTransactionDetails(formData)).rejects.toThrow(
      "REDIRECT:/transactions?error=Transaction%20could%20not%20be%20updated.%20It%20may%20be%20out%20of%20scope%20or%20no%20longer%20available.",
    );
  });

  it("editTransactionDetails succeeds with returnTo and revalidates dashboard and transactions", async () => {
    const selectMock = vi.fn().mockReturnValue({
      returns: vi.fn().mockResolvedValue({
        data: [{ id: "tx-1" }],
        error: null,
      }),
    });
    const eqUserMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const eqIdMock = vi.fn().mockReturnValue({
      eq: eqUserMock,
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({
          eq: eqIdMock,
        }),
      })),
    });

    const { editTransactionDetails } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("merchant", "Cafe Nero");
    formData.set("amount", "120");
    formData.set("source", "card");
    formData.set("reference", "ref-1");
    formData.set("category", "Food");
    formData.set("date", "2026-05-22T10:30");
    formData.set("returnTo", "/transactions");

    await expect(editTransactionDetails(formData)).rejects.toThrow(
      "REDIRECT:/transactions?message=Transaction%20details%20updated.",
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/transactions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
  });

  it("editTransactionDetails defaults to dashboard return path for quick edit actions", async () => {
    const selectMock = vi.fn().mockReturnValue({
      returns: vi.fn().mockResolvedValue({
        data: [{ id: "tx-1" }],
        error: null,
      }),
    });
    const eqUserMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const eqIdMock = vi.fn().mockReturnValue({
      eq: eqUserMock,
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({
          eq: eqIdMock,
        }),
      })),
    });

    const { editTransactionDetails } = await import("@/app/dashboard/actions");
    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("merchant", "Cafe Nero");
    formData.set("amount", "120");
    formData.set("source", "card");
    formData.set("reference", "ref-1");
    formData.set("category", "Food");
    formData.set("date", "2026-05-22T10:30");

    await expect(editTransactionDetails(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=Transaction%20details%20updated.",
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/transactions");
    expect(revalidatePathMock).toHaveBeenCalledWith("/budgets");
  });
});
