import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runFinanceChatPipeline } from "@/lib/chat/pipeline";

const originalApiKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("finance chat pipeline grounding", () => {
  it("builds grounded heuristic answers from transactions, budgets, and goals", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await runFinanceChatPipeline({
      question: "How are my goals doing?",
      transactions: [
        {
          id: "tx-1",
          date: "2026-05-22T10:00:00.000Z",
          merchant: "Metro",
          amount: 500,
          category: "Groceries",
          source: "card",
          ai_classification: "wise",
        },
        {
          id: "tx-2",
          date: "2026-05-20T10:00:00.000Z",
          merchant: "Fuel Stop",
          amount: 1000,
          category: "Transport",
          source: "upi",
          ai_classification: "wise",
        },
      ],
      budgets: [
        {
          id: "b-1",
          category: "Groceries",
          amount_limit: 5000,
          month: "2026-05",
        },
      ],
      goals: [
        {
          id: "g-1",
          target_amount: 10000,
          current_amount: 4000,
          deadline: "2026-05-30",
          archived_at: null,
        },
      ],
    });

    expect(result.provider).toBe("heuristic");
    expect(result.context.transactionCount).toBe(2);
    expect(result.context.budget.budgetCount).toBe(1);
    expect(result.context.goals.totalGoals).toBe(1);
    expect(result.answer.toLowerCase()).toContain("goal");
  });

  it("uses recent session turns to keep continuity for follow-up prompts", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await runFinanceChatPipeline({
      question: "What about last week?",
      history: [
        { role: "user", content: "How much did I spend this month?" },
        { role: "assistant", content: "You spent 1500.00 this month." },
      ],
      transactions: [
        {
          id: "tx-1",
          date: "2026-05-22T10:00:00.000Z",
          merchant: "Metro",
          amount: 500,
          category: "Groceries",
          source: "card",
          ai_classification: "wise",
        },
      ],
      budgets: [],
      goals: [],
    });

    expect(result.provider).toBe("heuristic");
    expect(result.answer).toContain("Following up on spending");
  });

  it("sanitizes sensitive content in ai output before returning response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: "Reach me at user@example.com and set api_key=SECRET_VALUE_123456789012.",
          },
        ],
      }),
    } as Response);

    const result = await runFinanceChatPipeline({
      question: "Summarize my spending",
      transactions: [],
      budgets: [],
      goals: [],
    });

    expect(result.provider).toBe("anthropic");
    expect(result.answer).toContain("[redacted-email]");
    expect(result.answer).toContain("[redacted-secret]");
    expect(result.answer).not.toContain("123456789012");
  });
});
