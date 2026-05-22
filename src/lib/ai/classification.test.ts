import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyTransaction } from "@/lib/ai/classification";

const originalApiKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("classifyTransaction", () => {
  it("returns Claude label and reason when Anthropic call succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              label: "wise",
              reason: "This transaction supports an essential household need.",
            }),
          },
        ],
      }),
    } as Response);

    const result = await classifyTransaction({
      merchant: "Fresh Mart",
      amount: 1250,
      source: "upi",
      category: "groceries",
      reference: "UTR001",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      label: "wise",
      reason: "This transaction supports an essential household need.",
      provider: "anthropic",
    });
  });

  it("degrades gracefully to heuristic classification when Anthropic is unavailable", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await classifyTransaction({
      merchant: "Nightclub Lounge",
      amount: 1800,
      source: "card",
      category: null,
      reference: "TXN001",
    });

    expect(result).toEqual({
      ok: true,
      label: "useless",
      reason: "This looks like discretionary spend with lower long-term value.",
      provider: "heuristic",
    });
  });

  it("degrades gracefully to heuristic classification on Claude API failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const result = await classifyTransaction({
      merchant: "Metro Store",
      amount: 240,
      source: "wallet",
      category: null,
      reference: "TXN777",
    });

    expect(result).toEqual({
      ok: true,
      label: "wise",
      reason: "This is a relatively small-value spend that appears manageable.",
      provider: "heuristic",
    });
  });
});
