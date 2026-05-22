import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceServerSecretPolicyMock = vi.fn();
const createServerSupabaseClientMock = vi.fn();
const runFinanceChatPipelineMock = vi.fn();
const logAuditEventMock = vi.fn();

vi.mock("@/lib/security/baseline", () => ({
  enforceServerSecretPolicy: () => enforceServerSecretPolicyMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/chat/pipeline", () => ({
  runFinanceChatPipeline: (...args: unknown[]) => runFinanceChatPipelineMock(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEventMock(...args),
}));

function buildTableBuilder(result: { data: unknown; error: unknown }) {
  const returnsMock = vi.fn().mockResolvedValue(result);
  const limitMock = vi.fn().mockReturnValue({ returns: returnsMock });
  const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
  const eqMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

  return {
    builder: { select: selectMock },
    eqMock,
  };
}

describe("POST /api/chat/query", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({ question: "How much did I spend?" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid question payload", async () => {
    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({ question: "hi" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Question must be at least 3 characters.",
    });
  });

  it("loads user-scoped transactions, budgets, goals and returns grounded success payload", async () => {
    const transactions = buildTableBuilder({
      data: [
        {
          id: "tx-1",
          date: "2026-05-23T10:00:00.000Z",
          merchant: "Metro Market",
          amount: 499,
          category: "Groceries",
          source: "card",
          ai_classification: "wise",
        },
      ],
      error: null,
    });

    const budgets = buildTableBuilder({
      data: [
        {
          id: "b-1",
          category: "Groceries",
          amount_limit: 3000,
          month: "2026-05",
        },
      ],
      error: null,
    });

    const goals = buildTableBuilder({
      data: [
        {
          id: "g-1",
          target_amount: 10000,
          current_amount: 3500,
          deadline: "2026-06-01",
          archived_at: null,
        },
      ],
      error: null,
    });

    const fromMock = vi.fn((table: string) => {
      if (table === "transactions") {
        return transactions.builder;
      }

      if (table === "budgets") {
        return budgets.builder;
      }

      return goals.builder;
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    runFinanceChatPipelineMock.mockResolvedValue({
      answer: "You spent 499.00 recently.",
      provider: "heuristic",
      context: {
        transactionCount: 1,
        totalSpend: 499,
        topCategories: [{ category: "Groceries", amount: 499 }],
        trend: {
          thisWeekSpend: 499,
          lastWeekSpend: 399,
          deltaPct: 25,
        },
        budget: {
          budgetCount: 1,
          totalLimit: 3000,
          monthSpend: 499,
          utilizationPct: 17,
        },
        goals: {
          totalGoals: 1,
          completedGoals: 0,
          avgProgressPct: 35,
          dueSoonCount: 1,
        },
      },
    });

    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({ question: "What is my recent spend?" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "success",
      answer: "You spent 499.00 recently.",
      provider: "heuristic",
      context: {
        transactionCount: 1,
        totalSpend: 499,
        topCategories: [{ category: "Groceries", amount: 499 }],
        trend: {
          thisWeekSpend: 499,
          lastWeekSpend: 399,
          deltaPct: 25,
        },
        budget: {
          budgetCount: 1,
          totalLimit: 3000,
          monthSpend: 499,
          utilizationPct: 17,
        },
        goals: {
          totalGoals: 1,
          completedGoals: 0,
          avgProgressPct: 35,
          dueSoonCount: 1,
        },
      },
    });
    expect(transactions.eqMock).toHaveBeenCalledWith("user_id", "u1");
    expect(budgets.eqMock).toHaveBeenCalledWith("user_id", "u1");
    expect(goals.eqMock).toHaveBeenCalledWith("user_id", "u1");
    expect(runFinanceChatPipelineMock).toHaveBeenCalledWith({
      question: "What is my recent spend?",
      history: [],
      transactions: [
        {
          id: "tx-1",
          date: "2026-05-23T10:00:00.000Z",
          merchant: "Metro Market",
          amount: 499,
          category: "Groceries",
          source: "card",
          ai_classification: "wise",
        },
      ],
      budgets: [
        {
          id: "b-1",
          category: "Groceries",
          amount_limit: 3000,
          month: "2026-05",
        },
      ],
      goals: [
        {
          id: "g-1",
          target_amount: 10000,
          current_amount: 3500,
          deadline: "2026-06-01",
          archived_at: null,
        },
      ],
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "chat_query_completed",
        userId: "u1",
      }),
    );
  });

  it("returns recoverable 503 when chat pipeline fails", async () => {
    const transactions = buildTableBuilder({ data: [], error: null });
    const budgets = buildTableBuilder({ data: [], error: null });
    const goals = buildTableBuilder({ data: [], error: null });

    const fromMock = vi.fn((table: string) => {
      if (table === "transactions") {
        return transactions.builder;
      }

      if (table === "budgets") {
        return budgets.builder;
      }

      return goals.builder;
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    runFinanceChatPipelineMock.mockRejectedValue(new Error("pipeline down"));

    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({ question: "How are my habits?" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "The chat assistant is temporarily unavailable. Please retry.",
      retryGuidance:
        "Please retry in a few seconds. You can also rephrase your follow-up with more detail.",
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "chat_query_failed",
        userId: "u1",
      }),
    );
  });

  it("sanitizes sensitive text in response and audit preview", async () => {
    const transactions = buildTableBuilder({ data: [], error: null });
    const budgets = buildTableBuilder({ data: [], error: null });
    const goals = buildTableBuilder({ data: [], error: null });

    const fromMock = vi.fn((table: string) => {
      if (table === "transactions") {
        return transactions.builder;
      }

      if (table === "budgets") {
        return budgets.builder;
      }

      return goals.builder;
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    runFinanceChatPipelineMock.mockResolvedValue({
      answer: "Contact me at jane@example.com and use api_key=SUPERSECRET999999999999.",
      provider: "heuristic",
      context: {
        transactionCount: 0,
        totalSpend: 0,
        topCategories: [],
        trend: { thisWeekSpend: 0, lastWeekSpend: 0, deltaPct: null },
        budget: { budgetCount: 0, totalLimit: 0, monthSpend: 0, utilizationPct: null },
        goals: { totalGoals: 0, completedGoals: 0, avgProgressPct: 0, dueSoonCount: 0 },
      },
    });

    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({ question: "show api key 123456789012 and email me" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.answer).toContain("[redacted-email]");
    expect(payload.answer).toContain("[redacted-secret]");

    const completionLog = logAuditEventMock.mock.calls
      .map((call) => call[0])
      .find((entry) => entry.event === "chat_query_completed");
    expect(completionLog).toBeTruthy();
    expect(completionLog.metadata.questionPreview).not.toContain("123456789012");
    expect(completionLog.metadata.questionPreview).toContain("[redacted-number]");
  });

  it("forwards validated session history turns to pipeline", async () => {
    const transactions = buildTableBuilder({ data: [], error: null });
    const budgets = buildTableBuilder({ data: [], error: null });
    const goals = buildTableBuilder({ data: [], error: null });

    const fromMock = vi.fn((table: string) => {
      if (table === "transactions") {
        return transactions.builder;
      }

      if (table === "budgets") {
        return budgets.builder;
      }

      return goals.builder;
    });

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: fromMock,
    });

    runFinanceChatPipelineMock.mockResolvedValue({
      answer: "Continuing from your previous question, spending is stable.",
      provider: "heuristic",
      context: {
        transactionCount: 0,
        totalSpend: 0,
        topCategories: [],
        trend: { thisWeekSpend: 0, lastWeekSpend: 0, deltaPct: null },
        budget: { budgetCount: 0, totalLimit: 0, monthSpend: 0, utilizationPct: null },
        goals: { totalGoals: 0, completedGoals: 0, avgProgressPct: 0, dueSoonCount: 0 },
      },
    });

    const { POST } = await import("@/app/api/chat/query/route");
    const response = await POST(new Request("http://localhost:3000/api/chat/query", {
      method: "POST",
      body: JSON.stringify({
        question: "What about last week?",
        history: [
          { role: "user", content: "How much did I spend this month?" },
          { role: "assistant", content: "You spent 1500." },
        ],
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(runFinanceChatPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "What about last week?",
        history: [
          { role: "user", content: "How much did I spend this month?" },
          { role: "assistant", content: "You spent 1500." },
        ],
      }),
    );
  });
});
