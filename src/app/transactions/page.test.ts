import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const createServerSupabaseClientMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/app/components/app-shell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/app/dashboard/actions", () => ({
  assignTransactionCategory: vi.fn(),
  createManualExpense: vi.fn(),
  reviewTransactionClassification: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

function buildQueueBuilder(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue(result),
  };
}

function buildMainBuilder(result: { data: unknown; count: number; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnValue({
      returns: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe("transactions history query behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("applies user-scoped search/filter/date query with pagination", async () => {
    const queueBuilder = buildQueueBuilder({ data: [], error: null });
    const mainBuilder = buildMainBuilder({ data: [], count: 0, error: null });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(queueBuilder)
      .mockReturnValueOnce(mainBuilder);

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { default: TransactionsPage } = await import("@/app/transactions/page");

    await TransactionsPage({
      searchParams: Promise.resolve({
        page: "2",
        q: "cafe",
        source: "card",
        category: "Food",
        from: "2026-05-01",
        to: "2026-05-31",
      }),
    });

    expect(fromMock).toHaveBeenCalledWith("transactions");
    expect(mainBuilder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(mainBuilder.or).toHaveBeenCalledWith("merchant.ilike.%cafe%,reference.ilike.%cafe%");
    expect(mainBuilder.eq).toHaveBeenCalledWith("source", "card");
    expect(mainBuilder.ilike).toHaveBeenCalledWith("category", "Food");
    expect(mainBuilder.gte).toHaveBeenCalledWith("date", expect.stringMatching(/^2026-05-01T/));
    expect(mainBuilder.lte).toHaveBeenCalledWith("date", expect.stringMatching(/^2026-05-31T/));
    expect(mainBuilder.range).toHaveBeenCalledWith(10, 19);
  });

  it("uses uncategorized-only mode and does not apply category ilike", async () => {
    const queueBuilder = buildQueueBuilder({ data: [], error: null });
    const mainBuilder = buildMainBuilder({ data: [], count: 0, error: null });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(queueBuilder)
      .mockReturnValueOnce(mainBuilder);

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { default: TransactionsPage } = await import("@/app/transactions/page");

    await TransactionsPage({
      searchParams: Promise.resolve({
        uncategorized: "1",
        category: "Food",
      }),
    });

    expect(mainBuilder.or).toHaveBeenCalledWith("category.is.null,category.eq.");
    expect(mainBuilder.ilike).not.toHaveBeenCalledWith("category", "Food");
  });

  it("redirects unauthenticated users to sign-in", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { default: TransactionsPage } = await import("@/app/transactions/page");

    await expect(
      TransactionsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("renders original AI output audit details in transactions view", async () => {
    const queueBuilder = buildQueueBuilder({
      data: [
        {
          id: "q-1",
          amount: 120,
          merchant: "Queue Merchant",
          source: "upi",
          reference: "QREF",
          date: "2026-05-22T10:00:00.000Z",
          category: null,
          ai_classification: "wise",
          ai_reason: "Current AI reason",
          ai_raw_classification: "wise",
          ai_raw_reason: "Original AI reason",
          ai_user_classification: null,
          ai_user_reason: null,
          ai_review_state: "pending",
        },
      ],
      error: null,
    });
    const mainBuilder = buildMainBuilder({
      data: [
        {
          id: "tx-1",
          amount: 499,
          merchant: "Store One",
          source: "card",
          reference: "REF-1",
          date: "2026-05-21T10:00:00.000Z",
          category: "Food",
          ai_classification: "useless",
          ai_reason: "Overridden reason",
          ai_raw_classification: "wise",
          ai_raw_reason: "Model said essential",
          ai_user_classification: "useless",
          ai_user_reason: "User override",
          ai_review_state: "overridden",
        },
      ],
      count: 1,
      error: null,
    });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(queueBuilder)
      .mockReturnValueOnce(mainBuilder);

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    const { default: TransactionsPage } = await import("@/app/transactions/page");

    const element = await TransactionsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Show original AI output (audit)");
    expect(html).toContain("Original label:");
    expect(html).toContain("Original reason:");
    expect(html).toContain("Model said essential");
  });
});
