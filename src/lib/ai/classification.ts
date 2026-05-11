import "server-only";

type ClassificationLabel = "wise" | "useless";

type ClassificationSuccess = {
  ok: true;
  label: ClassificationLabel;
  reason: string;
  provider: "anthropic" | "heuristic";
};

type ClassificationFailure = {
  ok: false;
  reason: string;
  retryable: boolean;
};

export type ClassificationResult = ClassificationSuccess | ClassificationFailure;

export type ClassificationInput = {
  merchant: string;
  amount: number;
  source: string;
  category?: string | null;
  reference?: string | null;
};

const ESSENTIAL_CATEGORIES = new Set([
  "groceries",
  "bills",
  "rent",
  "health",
  "medical",
  "transport",
  "education",
]);

const IMPULSE_HINTS = [
  "nightclub",
  "bar",
  "liquor",
  "gaming",
  "lottery",
  "bet",
  "luxury",
];

function isAnthropicBypassedForLocalDev(apiKey: string) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const normalized = apiKey.trim().toLowerCase();
  return (
    normalized === "local-dev-no-paid" ||
    normalized === "dummy" ||
    normalized === "placeholder" ||
    normalized.startsWith("local-dev-")
  );
}

function heuristicClassification(input: ClassificationInput): ClassificationSuccess {
  const category = (input.category ?? "").trim().toLowerCase();
  const merchant = input.merchant.trim().toLowerCase();

  if (category && ESSENTIAL_CATEGORIES.has(category)) {
    return {
      ok: true,
      label: "wise",
      reason: "This appears to be essential spending based on the assigned category.",
      provider: "heuristic",
    };
  }

  const hasImpulseHint = IMPULSE_HINTS.some((hint) => merchant.includes(hint));
  if (hasImpulseHint && input.amount >= 500) {
    return {
      ok: true,
      label: "useless",
      reason: "This looks like discretionary spend with lower long-term value.",
      provider: "heuristic",
    };
  }

  if (input.amount <= 300) {
    return {
      ok: true,
      label: "wise",
      reason: "This is a relatively small-value spend that appears manageable.",
      provider: "heuristic",
    };
  }

  return {
    ok: true,
    label: "useless",
    reason: "This spend may be non-essential; review whether it supports your current goals.",
    provider: "heuristic",
  };
}

function parseClaudeContentToJson(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as { label?: unknown; reason?: unknown };
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as { label?: unknown; reason?: unknown };
    } catch {
      return null;
    }
  }
}

async function classifyWithAnthropic(input: ClassificationInput): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "ANTHROPIC_API_KEY is missing.",
      retryable: false,
    };
  }

  if (isAnthropicBypassedForLocalDev(apiKey)) {
    return {
      ok: false,
      reason: "Anthropic disabled for local development.",
      retryable: false,
    };
  }

  const prompt = `Classify this transaction as wise or useless for personal finance coaching. Respond with JSON only: {"label":"wise|useless","reason":"1-2 short sentences"}. Transaction: ${JSON.stringify(
    {
      merchant: input.merchant,
      amount: input.amount,
      source: input.source,
      category: input.category ?? null,
      reference: input.reference ?? null,
    },
  )}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 140,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `Claude API returned ${response.status}.`,
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const firstText = payload.content?.find((part) => part.type === "text")?.text ?? "";
    const parsed = parseClaudeContentToJson(firstText);

    const label = parsed?.label;
    const reason = parsed?.reason;

    if ((label !== "wise" && label !== "useless") || typeof reason !== "string") {
      return {
        ok: false,
        reason: "Claude response did not match expected schema.",
        retryable: true,
      };
    }

    const normalizedReason = reason.trim();
    if (normalizedReason.length < 8 || normalizedReason.length > 240) {
      return {
        ok: false,
        reason: "Claude reason length outside allowed bounds.",
        retryable: true,
      };
    }

    return {
      ok: true,
      label,
      reason: normalizedReason,
      provider: "anthropic",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        reason: "Claude request timed out.",
        retryable: true,
      };
    }

    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Claude request failed.",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyTransaction(input: ClassificationInput): Promise<ClassificationResult> {
  const aiResult = await classifyWithAnthropic(input);
  if (aiResult.ok) {
    return aiResult;
  }

  return heuristicClassification(input);
}
