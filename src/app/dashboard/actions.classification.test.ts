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

describe("reviewTransactionClassification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("accept restores original AI output and clears override fields", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "tx-1",
        ai_classification: "useless",
        ai_reason: "User override applied previously.",
        ai_raw_classification: "wise",
        ai_raw_reason: "Original AI rationale.",
      },
      error: null,
    });

    const selectBuilder = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleMock,
        }),
      }),
    };

    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqIdMock = vi.fn().mockReturnValue({
      eq: updateEqUserMock,
    });
    const updateBuilder = {
      eq: updateEqIdMock,
    };

    const fromMock = vi.fn(() => {
      if (fromMock.mock.calls.length === 1) {
        return {
          select: vi.fn().mockReturnValue(selectBuilder),
        };
      }

      return {
        update: vi.fn().mockReturnValue(updateBuilder),
      };
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { reviewTransactionClassification } = await import("@/app/dashboard/actions");

    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("decision", "accept");
    formData.set("returnTo", "/transactions");

    await expect(reviewTransactionClassification(formData)).rejects.toThrow(
      "REDIRECT:/transactions?message=AI%20classification%20accepted.",
    );

    expect(updateEqIdMock).toHaveBeenCalledWith("id", "tx-1");
    expect(updateEqUserMock).toHaveBeenCalledWith("user_id", "u1");
    const updatePayload = (fromMock.mock.results[1]?.value.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatePayload).toEqual(
      expect.objectContaining({
        ai_classification: "wise",
        ai_reason: "Original AI rationale.",
        ai_user_classification: null,
        ai_user_reason: null,
        ai_review_state: "accepted",
      }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "classification_accepted",
        userId: "u1",
        metadata: expect.objectContaining({
          transactionId: "tx-1",
          label: "wise",
        }),
      }),
    );
  });

  it("sanitizes external returnTo when decision input is invalid", async () => {
    const { reviewTransactionClassification } = await import("@/app/dashboard/actions");

    const formData = new FormData();
    formData.set("transactionId", "tx-1");
    formData.set("decision", "bad-value");
    formData.set("returnTo", "https://evil.example.com");

    await expect(reviewTransactionClassification(formData)).rejects.toThrow(
      "REDIRECT:/transactions?error=Invalid%20classification%20decision.",
    );
  });

  it("override updates effective and user classification state", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "tx-2",
        ai_classification: "wise",
        ai_reason: "AI baseline reason.",
        ai_raw_classification: "wise",
        ai_raw_reason: "AI baseline reason.",
      },
      error: null,
    });

    const selectBuilder = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleMock,
        }),
      }),
    };

    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqIdMock = vi.fn().mockReturnValue({
      eq: updateEqUserMock,
    });
    const updateBuilder = {
      eq: updateEqIdMock,
    };

    const fromMock = vi.fn(() => {
      if (fromMock.mock.calls.length === 1) {
        return {
          select: vi.fn().mockReturnValue(selectBuilder),
        };
      }

      return {
        update: vi.fn().mockReturnValue(updateBuilder),
      };
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { reviewTransactionClassification } = await import("@/app/dashboard/actions");

    const formData = new FormData();
    formData.set("transactionId", "tx-2");
    formData.set("decision", "override");
    formData.set("label", "useless");
    formData.set("reason", "User says this was purely impulsive spending.");
    formData.set("returnTo", "/transactions");

    await expect(reviewTransactionClassification(formData)).rejects.toThrow(
      "REDIRECT:/transactions?message=Classification%20override%20saved.",
    );

    const updatePayload = (fromMock.mock.results[1]?.value.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updatePayload).toEqual(
      expect.objectContaining({
        ai_raw_classification: "wise",
        ai_raw_reason: "AI baseline reason.",
        ai_user_classification: "useless",
        ai_user_reason: "User says this was purely impulsive spending.",
        ai_classification: "useless",
        ai_reason: "User says this was purely impulsive spending.",
        ai_review_state: "overridden",
      }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "classification_overridden",
        userId: "u1",
        metadata: expect.objectContaining({
          transactionId: "tx-2",
          label: "useless",
        }),
      }),
    );
  });
});
