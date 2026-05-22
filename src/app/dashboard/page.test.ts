import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const createServerSupabaseClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/user/income-preferences", () => ({
  getBalanceTarget: vi.fn().mockResolvedValue(null),
}));

describe("dashboard AI audit exposure query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests original AI output fields for uncategorized and recent transaction views", async () => {
    const STOP = "STOP_AFTER_AUDIT_SELECTS";

    const financialDocumentsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    const uncategorizedBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    const recentBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    const fromMock = vi.fn(() => {
      const callCount = fromMock.mock.calls.length;
      if (callCount === 1) {
        return financialDocumentsBuilder;
      }
      if (callCount === 2) {
        return uncategorizedBuilder;
      }
      if (callCount === 3) {
        return recentBuilder;
      }

      throw new Error(STOP);
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "u1@example.com" } } }),
      },
      from: fromMock,
    });

    const { default: DashboardPage } = await import("@/app/dashboard/page");

    await expect(
      DashboardPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(STOP);

    expect(uncategorizedBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("ai_raw_classification"),
    );
    expect(uncategorizedBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("ai_raw_reason"),
    );
    expect(recentBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("ai_raw_classification"),
    );
    expect(recentBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("ai_raw_reason"),
    );
  }, 60_000);
});
