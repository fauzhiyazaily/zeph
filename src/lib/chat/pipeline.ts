import "server-only";

export type ChatContextTransaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string | null;
  source: string;
  ai_classification: string | null;
};

export type ChatContextBudget = {
  id: string;
  category: string;
  amount_limit: number;
  month: string;
};

export type ChatContextGoal = {
  id: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  archived_at: string | null;
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSummaryContext = {
  transactionCount: number;
  totalSpend: number;
  topCategories: Array<{ category: string; amount: number }>;
  trend: {
    thisWeekSpend: number;
    lastWeekSpend: number;
    deltaPct: number | null;
  };
  budget: {
    budgetCount: number;
    totalLimit: number;
    monthSpend: number;
    utilizationPct: number | null;
  };
  goals: {
    totalGoals: number;
    completedGoals: number;
    avgProgressPct: number;
    dueSoonCount: number;
  };
};

export type ChatPipelineResult = {
  answer: string;
  provider: "anthropic" | "heuristic";
  context: ChatSummaryContext;
};

type AnthropicMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

function normalizeQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim();
}

function toTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

function sanitizeAssistantResponse(answer: string) {
  const compact = answer.replace(/\s+/g, " ").trim().slice(0, 600);

  return compact
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:sk|api|key|token|secret)[-_a-z0-9:=]{8,}\b/gi, "[redacted-secret]")
    .replace(/\b\d{12,}\b/g, "[redacted-number]");
}

function sanitizeHistory(history: ChatHistoryTurn[]) {
  return history
    .filter((turn) => turn && typeof turn.content === "string")
    .map((turn) => ({
      role: turn.role,
      content: turn.content.replace(/\s+/g, " ").trim().slice(0, 400),
    }))
    .filter((turn) => turn.content.length > 0)
    .slice(-10);
}

function isLikelyFollowUp(question: string) {
  const lower = question.toLowerCase();
  if (lower.length <= 24) {
    return true;
  }

  const markers = ["what about", "and ", "that", "those", "it", "them", "also", "again"];
  return markers.some((marker) => lower.includes(marker));
}

function latestUserTopic(history: ChatHistoryTurn[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn.role !== "user") {
      continue;
    }

    const text = turn.content.toLowerCase();
    if (text.includes("budget") || text.includes("limit")) {
      return "budget";
    }

    if (text.includes("goal") || text.includes("saving") || text.includes("save")) {
      return "goals";
    }

    if (text.includes("category") || text.includes("merchant")) {
      return "categories";
    }

    if (text.includes("spend") || text.includes("spent") || text.includes("total")) {
      return "spending";
    }
  }

  return "your recent finances";
}

function summarizeContext(input: {
  transactions: ChatContextTransaction[];
  budgets: ChatContextBudget[];
  goals: ChatContextGoal[];
}) {
  const { transactions, budgets, goals } = input;
  const transactionCount = transactions.length;
  const totalSpend = transactions.reduce((sum, row) => sum + Number(row.amount), 0);

  const byCategory = new Map<string, number>();
  for (const row of transactions) {
    const category = (row.category ?? "Uncategorized").trim() || "Uncategorized";
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(row.amount));
  }

  const topCategories = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  let thisWeekSpend = 0;
  let lastWeekSpend = 0;
  for (const row of transactions) {
    const at = new Date(row.date);
    if (at >= sevenDaysAgo && at <= now) {
      thisWeekSpend += Number(row.amount);
      continue;
    }

    if (at >= fourteenDaysAgo && at < sevenDaysAgo) {
      lastWeekSpend += Number(row.amount);
    }
  }

  const deltaPct = lastWeekSpend > 0
    ? Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100)
    : null;

  const monthKey = now.toISOString().slice(0, 7);
  const monthBudgets = budgets.filter((row) => row.month === monthKey);
  const totalLimit = monthBudgets.reduce((sum, row) => sum + Number(row.amount_limit), 0);
  const monthSpend = transactions
    .filter((row) => row.date.slice(0, 7) === monthKey)
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const utilizationPct = totalLimit > 0
    ? Math.round((monthSpend / totalLimit) * 100)
    : null;

  const activeGoals = goals.filter((goal) => !goal.archived_at);
  const completedGoals = activeGoals.filter(
    (goal) => Number(goal.target_amount) > 0 && Number(goal.current_amount) >= Number(goal.target_amount),
  ).length;
  const avgProgressPct = activeGoals.length > 0
    ? Math.round(
      activeGoals.reduce((sum, goal) => {
        const target = Number(goal.target_amount);
        const current = Number(goal.current_amount);
        if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0) {
          return sum;
        }

        return sum + Math.min(100, Math.round((current / target) * 100));
      }, 0) / activeGoals.length,
    )
    : 0;
  const dueSoonCutoff = new Date(now);
  dueSoonCutoff.setUTCDate(dueSoonCutoff.getUTCDate() + 7);
  const dueSoonCount = activeGoals.filter((goal) => {
    const deadline = new Date(`${goal.deadline}T00:00:00.000Z`);
    return !Number.isNaN(deadline.getTime()) && deadline >= now && deadline <= dueSoonCutoff;
  }).length;

  return {
    transactionCount,
    totalSpend: toTwoDecimals(totalSpend),
    topCategories,
    trend: {
      thisWeekSpend: toTwoDecimals(thisWeekSpend),
      lastWeekSpend: toTwoDecimals(lastWeekSpend),
      deltaPct,
    },
    budget: {
      budgetCount: monthBudgets.length,
      totalLimit: toTwoDecimals(totalLimit),
      monthSpend: toTwoDecimals(monthSpend),
      utilizationPct,
    },
    goals: {
      totalGoals: activeGoals.length,
      completedGoals,
      avgProgressPct,
      dueSoonCount,
    },
  };
}

function buildHeuristicAnswer(question: string, summary: ChatSummaryContext, history: ChatHistoryTurn[]) {
  const lowerQuestion = question.toLowerCase();
  const continuityPrefix = history.length > 0 && isLikelyFollowUp(question)
    ? `Following up on ${latestUserTopic(history)}, `
    : "";

  if (summary.transactionCount === 0) {
    return "I could not find recent transactions for your account yet. Add or import transactions, then ask again for spending insights.";
  }

  if (lowerQuestion.includes("total") || lowerQuestion.includes("spend") || lowerQuestion.includes("spent")) {
    const trendPhrase = summary.trend.deltaPct === null
      ? "week-over-week trend is not available yet"
      : `week-over-week change is ${summary.trend.deltaPct}%`;
    return `${continuityPrefix}from your recent ${summary.transactionCount} transactions, total spend is ${summary.totalSpend.toFixed(2)} and ${trendPhrase}.`;
  }

  if (lowerQuestion.includes("budget") || lowerQuestion.includes("limit")) {
    if (summary.budget.budgetCount === 0) {
      return "You do not have active budgets for this month yet, so utilization guidance is limited. Create a budget to unlock budget-based recommendations.";
    }

    return `${continuityPrefix}you have ${summary.budget.budgetCount} active budgets this month with a combined limit of ${summary.budget.totalLimit.toFixed(2)}. Current spend in this month is ${summary.budget.monthSpend.toFixed(2)} (${summary.budget.utilizationPct}% utilized).`;
  }

  if (lowerQuestion.includes("goal") || lowerQuestion.includes("save") || lowerQuestion.includes("saving")) {
    return `${continuityPrefix}you have ${summary.goals.totalGoals} active goals, ${summary.goals.completedGoals} completed, with average progress at ${summary.goals.avgProgressPct}%. ${summary.goals.dueSoonCount} goals are due within 7 days.`;
  }

  if (lowerQuestion.includes("category") || lowerQuestion.includes("where") || lowerQuestion.includes("most")) {
    const top = summary.topCategories[0];
    if (!top) {
      return `I reviewed ${summary.transactionCount} transactions totaling ${summary.totalSpend.toFixed(2)}, but there is no clear category concentration yet.`;
    }

    return `${continuityPrefix}your top category in recent activity is ${top.category} at ${top.amount.toFixed(2)}. Overall spend in scope is ${summary.totalSpend.toFixed(2)}.`;
  }

  return `${continuityPrefix}I reviewed your context across transactions, budgets, and goals: ${summary.transactionCount} transactions totaling ${summary.totalSpend.toFixed(2)}, ${summary.budget.budgetCount} budgets this month, and ${summary.goals.totalGoals} active goals at ${summary.goals.avgProgressPct}% average progress.`;
}

function parseAnthropicText(payload: AnthropicMessageResponse) {
  const text = payload.content?.find((part) => part.type === "text")?.text;
  return typeof text === "string" ? text.trim() : "";
}

async function askAnthropic(question: string, summary: ChatSummaryContext, history: ChatHistoryTurn[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const normalized = apiKey.trim().toLowerCase();
  if (
    process.env.NODE_ENV !== "production" &&
    (normalized === "local-dev-no-paid" ||
      normalized === "dummy" ||
      normalized === "placeholder" ||
      normalized.startsWith("local-dev-"))
  ) {
    return null;
  }

  const historyContext = history.length > 0
    ? `Recent conversation turns:\n${history.map((turn) => `${turn.role}: ${turn.content}`).join("\n")}`
    : "Recent conversation turns: none";

  const prompt = [
    "You are a concise personal finance assistant.",
    "Use only this user context:",
    JSON.stringify(summary),
    historyContext,
    `User question: ${question}`,
    "Respond in 1-3 sentences with plain text only.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

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
        max_tokens: 180,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    const answer = parseAnthropicText(payload);
    if (!answer) {
      return null;
    }

    return answer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runFinanceChatPipeline(input: {
  question: string;
  history?: ChatHistoryTurn[];
  transactions: ChatContextTransaction[];
  budgets: ChatContextBudget[];
  goals: ChatContextGoal[];
}): Promise<ChatPipelineResult> {
  const question = normalizeQuestion(input.question);
  const history = sanitizeHistory(input.history ?? []);
  const summary = summarizeContext({
    transactions: input.transactions,
    budgets: input.budgets,
    goals: input.goals,
  });

  const aiAnswer = await askAnthropic(question, summary, history);
  if (aiAnswer) {
    return {
      answer: sanitizeAssistantResponse(aiAnswer),
      provider: "anthropic",
      context: summary,
    };
  }

  return {
    answer: sanitizeAssistantResponse(buildHeuristicAnswer(question, summary, history)),
    provider: "heuristic",
    context: summary,
  };
}
