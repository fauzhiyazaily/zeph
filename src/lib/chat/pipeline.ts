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
  avgTransactionAmount: number;
  thisMonthTransactionCount: number;
  thisWeekTransactionCount: number;
  lastWeekTransactionCount: number;
  timeframeSpend: {
    today: number;
    yesterday: number;
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    lastMonth: number;
  };
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
  provider: "anthropic" | "gemini" | "heuristic";
  context: ChatSummaryContext;
};

type AnthropicMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
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

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectTimeScope(question: string) {
  const text = question.toLowerCase();
  if (hasAny(text, ["today"])) {
    return "today" as const;
  }

  if (hasAny(text, ["yesterday"])) {
    return "yesterday" as const;
  }

  if (hasAny(text, ["last week", "previous week"])) {
    return "last-week" as const;
  }

  if (hasAny(text, ["this week", "weekly"])) {
    return "this-week" as const;
  }

  if (hasAny(text, ["last month", "previous month"])) {
    return "last-month" as const;
  }

  if (hasAny(text, ["this month", "monthly"])) {
    return "this-month" as const;
  }

  return "recent" as const;
}

function scopeLabel(scope: ReturnType<typeof detectTimeScope>) {
  if (scope === "today") {
    return "today";
  }

  if (scope === "yesterday") {
    return "yesterday";
  }

  if (scope === "this-week") {
    return "this week";
  }

  if (scope === "last-week") {
    return "last week";
  }

  if (scope === "this-month") {
    return "this month";
  }

  if (scope === "last-month") {
    return "last month";
  }

  return "recent activity";
}

function filterTransactionsByScope(
  transactions: ChatContextTransaction[],
  scope: ReturnType<typeof detectTimeScope>,
) {
  if (scope === "recent") {
    return transactions;
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayKey = yesterdayDate.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  const monthKey = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthKey = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return transactions.filter((row) => {
    if (scope === "today") {
      return row.date.slice(0, 10) === todayKey;
    }

    if (scope === "yesterday") {
      return row.date.slice(0, 10) === yesterdayKey;
    }

    if (scope === "this-week") {
      const at = new Date(row.date);
      return at >= sevenDaysAgo && at <= now;
    }

    if (scope === "last-week") {
      const at = new Date(row.date);
      return at >= fourteenDaysAgo && at < sevenDaysAgo;
    }

    if (scope === "this-month") {
      return row.date.slice(0, 7) === monthKey;
    }

    return row.date.slice(0, 7) === lastMonthKey;
  });
}

function normalizeMerchantHint(candidate: string) {
  const cleaned = candidate
    .replace(/[?.,!]/g, " ")
    .replace(/\b(this|last|previous)\s+(week|month)\b.*$/i, "")
    .replace(/\b(today|yesterday)\b.*$/i, "")
    .replace(/\b(my|the|a|an)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    return null;
  }

  const banned = new Set([
    "merchant",
    "category",
    "budget",
    "goal",
    "goals",
    "transactions",
    "transaction",
    "spend",
    "spent",
    "total",
    "money",
    "saving",
    "savings",
    "limit",
    "progress",
    "balance",
    "payment",
    "payments",
    "expense",
    "expenses",
    "account",
    "context",
  ]);
  if (banned.has(cleaned.toLowerCase())) {
    return null;
  }

  // Reject anything that still looks like a phrase (3+ words)
  if (cleaned.split(/\s+/).length > 3) {
    return null;
  }

  return cleaned;
}

function extractMerchantHint(question: string) {
  const text = question.toLowerCase();
  const patterns = [
    /\b(?:at|from|to)\s+([a-z0-9&' .-]{2,50})/i,
    /\bmerchant\s+([a-z0-9&' .-]{2,50})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const normalized = normalizeMerchantHint(match[1] ?? "");
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function merchantMatchScore(merchant: string, hint: string) {
  const left = merchant.toLowerCase().trim();
  const right = hint.toLowerCase().trim();

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 3;
  }

  if (left.includes(right) || right.includes(left)) {
    return 2;
  }

  const hintTokens = right.split(/\s+/).filter((token) => token.length >= 3);
  if (hintTokens.length > 0 && hintTokens.every((token) => left.includes(token))) {
    return 1;
  }

  return 0;
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
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthKey = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
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

  const todayKey = now.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayKey = yesterdayDate.toISOString().slice(0, 10);

  const spendByTime = transactions.reduce(
    (acc, row) => {
      const dateKey = row.date.slice(0, 10);
      const month = row.date.slice(0, 7);
      const amount = Number(row.amount);

      if (dateKey === todayKey) {
        acc.todaySpend += amount;
      }

      if (dateKey === yesterdayKey) {
        acc.yesterdaySpend += amount;
      }

      if (month === monthKey) {
        acc.thisMonthSpend += amount;
        acc.thisMonthCount += 1;
      }

      if (month === lastMonthKey) {
        acc.lastMonthSpend += amount;
      }

      const at = new Date(row.date);
      if (at >= sevenDaysAgo && at <= now) {
        acc.thisWeekCount += 1;
      }

      if (at >= fourteenDaysAgo && at < sevenDaysAgo) {
        acc.lastWeekCount += 1;
      }

      return acc;
    },
    {
      todaySpend: 0,
      yesterdaySpend: 0,
      thisMonthSpend: 0,
      lastMonthSpend: 0,
      thisMonthCount: 0,
      thisWeekCount: 0,
      lastWeekCount: 0,
    },
  );

  const avgTransactionAmount = transactionCount > 0 ? totalSpend / transactionCount : 0;

  return {
    transactionCount,
    totalSpend: toTwoDecimals(totalSpend),
    avgTransactionAmount: toTwoDecimals(avgTransactionAmount),
    thisMonthTransactionCount: spendByTime.thisMonthCount,
    thisWeekTransactionCount: spendByTime.thisWeekCount,
    lastWeekTransactionCount: spendByTime.lastWeekCount,
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
    timeframeSpend: {
      today: toTwoDecimals(spendByTime.todaySpend),
      yesterday: toTwoDecimals(spendByTime.yesterdaySpend),
      thisWeek: toTwoDecimals(thisWeekSpend),
      lastWeek: toTwoDecimals(lastWeekSpend),
      thisMonth: toTwoDecimals(spendByTime.thisMonthSpend),
      lastMonth: toTwoDecimals(spendByTime.lastMonthSpend),
    },
  };
}

function buildHeuristicAnswer(
  question: string,
  summary: ChatSummaryContext,
  history: ChatHistoryTurn[],
  transactions: ChatContextTransaction[],
) {
  const lowerQuestion = question.toLowerCase();
  const scope = detectTimeScope(lowerQuestion);
  const continuityPrefix = history.length > 0 && isLikelyFollowUp(question)
    ? `Following up on ${latestUserTopic(history)}, `
    : "";

  if (summary.transactionCount === 0) {
    return "I could not find recent transactions for your account yet. Add or import transactions, then ask again for spending insights.";
  }

  // Only attempt merchant extraction when the question clearly relates to spending or counts.
  // Without this guard, common prepositions ("to", "at", "from") in non-spend questions
  // like "Am I close to my budget?" or "How am I doing at saving?" get wrongly intercepted.
  const hasSpendIntent = hasAny(lowerQuestion, [
    "spend", "spent", "total", "how much", "how many", "count", "average", "avg", "mean",
  ]);

  // Detect top-merchant ranking intent before attempting specific merchant extraction.
  // Phrases like "which merchant had the highest spend?" match /\bmerchant\s+/ and extract
  // "had highest spend" as a merchant name — this guard prevents that intercept.
  const isTopMerchantQuery = hasAny(lowerQuestion, [
    "top merchant", "which merchant", "most at", "highest merchant", "biggest merchant",
    "highest spend", "most spend", "most spent",
  ]);

  const merchantHint = hasSpendIntent && !isTopMerchantQuery ? extractMerchantHint(lowerQuestion) : null;

  if (merchantHint) {
    const scopedTransactions = filterTransactionsByScope(transactions, scope);
    const merchantTransactions = scopedTransactions
      .map((row) => ({ row, score: merchantMatchScore(row.merchant, merchantHint) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (merchantTransactions.length === 0) {
      return `${continuityPrefix}I could not find transactions for merchant ${merchantHint} in ${scopeLabel(scope)}.`;
    }

    const total = merchantTransactions.reduce((sum, entry) => sum + Number(entry.row.amount), 0);
    const count = merchantTransactions.length;
    const average = count > 0 ? total / count : 0;
    const merchantLabel = merchantTransactions[0]?.row.merchant ?? merchantHint;

    if (hasAny(lowerQuestion, ["how many", "count", "number of transaction", "transactions count"])) {
      return `${continuityPrefix}you have ${count} transactions at ${merchantLabel} in ${scopeLabel(scope)}.`;
    }

    if (hasAny(lowerQuestion, ["average", "avg", "mean"])) {
      return `${continuityPrefix}your average transaction at ${merchantLabel} in ${scopeLabel(scope)} is ${toTwoDecimals(average).toFixed(2)} across ${count} transactions.`;
    }

    return `${continuityPrefix}you spent ${toTwoDecimals(total).toFixed(2)} at ${merchantLabel} in ${scopeLabel(scope)} across ${count} transactions.`;
  }

  if (hasAny(lowerQuestion, ["how many", "count", "number of transaction", "transactions count"])) {
    if (scope === "this-week") {
      return `${continuityPrefix}you have ${summary.thisWeekTransactionCount} transactions in this week.`;
    }

    if (scope === "last-week") {
      return `${continuityPrefix}you had ${summary.lastWeekTransactionCount} transactions in last week.`;
    }

    if (scope === "this-month") {
      return `${continuityPrefix}you have ${summary.thisMonthTransactionCount} transactions in this month.`;
    }

    return `${continuityPrefix}you have ${summary.transactionCount} transactions in recent context.`;
  }

  if (hasAny(lowerQuestion, ["average", "avg", "mean"])) {
    return `${continuityPrefix}your average transaction amount in recent context is ${summary.avgTransactionAmount.toFixed(2)} across ${summary.transactionCount} transactions.`;
  }

  if (lowerQuestion.includes("total") || lowerQuestion.includes("spend") || lowerQuestion.includes("spent")) {
    if (scope === "today") {
      return `${continuityPrefix}today's spend is ${summary.timeframeSpend.today.toFixed(2)}.`;
    }

    if (scope === "yesterday") {
      return `${continuityPrefix}yesterday's spend was ${summary.timeframeSpend.yesterday.toFixed(2)}.`;
    }

    if (scope === "this-week") {
      return `${continuityPrefix}this week's spend is ${summary.timeframeSpend.thisWeek.toFixed(2)} across ${summary.thisWeekTransactionCount} transactions.`;
    }

    if (scope === "last-week") {
      return `${continuityPrefix}last week's spend was ${summary.timeframeSpend.lastWeek.toFixed(2)} across ${summary.lastWeekTransactionCount} transactions.`;
    }

    if (scope === "this-month") {
      return `${continuityPrefix}this month's spend is ${summary.timeframeSpend.thisMonth.toFixed(2)} with ${summary.thisMonthTransactionCount} transactions.`;
    }

    if (scope === "last-month") {
      return `${continuityPrefix}last month's spend was ${summary.timeframeSpend.lastMonth.toFixed(2)}.`;
    }

    const trendPhrase = summary.trend.deltaPct === null
      ? "week-over-week trend is not available yet"
      : `week-over-week change is ${summary.trend.deltaPct}%`;
    return `${continuityPrefix}from your recent ${summary.transactionCount} transactions, total spend is ${summary.totalSpend.toFixed(2)} and ${trendPhrase}.`;
  }

  if (lowerQuestion.includes("budget") || lowerQuestion.includes("limit")) {
    if (summary.budget.budgetCount === 0) {
      return "You do not have active budgets for this month yet, so utilization guidance is limited. Create a budget to unlock budget-based recommendations.";
    }

    const utilizationText = summary.budget.utilizationPct === null
      ? "utilization is not available"
      : `${summary.budget.utilizationPct}% utilized`;
    return `${continuityPrefix}you have ${summary.budget.budgetCount} active budgets this month with a combined limit of ${summary.budget.totalLimit.toFixed(2)}. Current spend in this month is ${summary.budget.monthSpend.toFixed(2)} (${utilizationText}).`;
  }

  if (lowerQuestion.includes("goal") || lowerQuestion.includes("save") || lowerQuestion.includes("saving")) {
    if (summary.goals.totalGoals === 0) {
      return `${continuityPrefix}you do not have any active savings goals yet. Create a goal to start tracking your progress.`;
    }

    const dueSoonText = summary.goals.dueSoonCount > 0
      ? ` ${summary.goals.dueSoonCount} goal${summary.goals.dueSoonCount === 1 ? " is" : "s are"} due within 7 days.`
      : "";
    return `${continuityPrefix}you have ${summary.goals.totalGoals} active goal${summary.goals.totalGoals === 1 ? "" : "s"}, ${summary.goals.completedGoals} completed, with average progress at ${summary.goals.avgProgressPct}%.${dueSoonText}`;
  }

  if (
    hasAny(lowerQuestion, [
      "top merchant", "which merchant", "most at", "highest merchant", "biggest merchant",
      "highest spend", "most spend", "most spent",
    ])
  ) {
    const scopedTransactions = filterTransactionsByScope(transactions, scope);
    const byMerchant = new Map<string, { total: number; count: number }>();
    for (const row of scopedTransactions) {
      const key = row.merchant.trim() || "Unknown";
      const entry = byMerchant.get(key) ?? { total: 0, count: 0 };
      entry.total += Number(row.amount);
      entry.count += 1;
      byMerchant.set(key, entry);
    }

    const ranked = [...byMerchant.entries()]
      .map(([name, data]) => ({ name, total: data.total, count: data.count }))
      .sort((a, b) => b.total - a.total);

    if (ranked.length === 0) {
      return `${continuityPrefix}I could not find any transactions in ${scopeLabel(scope)} to rank merchants.`;
    }

    const topMerchant = ranked[0]!;
    const second = ranked[1];
    if (second) {
      return `${continuityPrefix}your top merchant in ${scopeLabel(scope)} is ${topMerchant.name} at ${toTwoDecimals(topMerchant.total).toFixed(2)} (${topMerchant.count} transactions), followed by ${second.name} at ${toTwoDecimals(second.total).toFixed(2)}.`;
    }

    return `${continuityPrefix}your top merchant in ${scopeLabel(scope)} is ${topMerchant.name} at ${toTwoDecimals(topMerchant.total).toFixed(2)} across ${topMerchant.count} transactions.`;
  }

  if (lowerQuestion.includes("category") || lowerQuestion.includes("where") || lowerQuestion.includes("most")) {
    const scopedTransactions = filterTransactionsByScope(transactions, scope);
    const byCategory = new Map<string, number>();
    for (const row of scopedTransactions) {
      const cat = (row.category ?? "Uncategorized").trim() || "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(row.amount));
    }

    const rankedCategories = [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    const top = rankedCategories[0] ?? summary.topCategories[0];
    if (!top) {
      return `I reviewed ${summary.transactionCount} transactions totaling ${summary.totalSpend.toFixed(2)}, but there is no clear category concentration yet.`;
    }

    const second = rankedCategories[1] ?? summary.topCategories[1];
    const label = scopeLabel(scope);
    if (second) {
      return `${continuityPrefix}your top category in ${label} is ${top.category} at ${toTwoDecimals(top.amount).toFixed(2)}, followed by ${second.category} at ${toTwoDecimals(second.amount).toFixed(2)}.`;
    }

    return `${continuityPrefix}your top category in ${label} is ${top.category} at ${toTwoDecimals(top.amount).toFixed(2)}.`;
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

function parseGeminiText(payload: GeminiGenerateContentResponse) {
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  return typeof text === "string" ? text.trim() : "";
}

async function askGemini(question: string, summary: ChatSummaryContext, history: ChatHistoryTurn[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const normalized = apiKey.trim().toLowerCase();
  if (
    process.env.NODE_ENV !== "production" &&
    (normalized === "dummy" || normalized === "placeholder" || normalized.startsWith("local-dev-"))
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
  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim() || "gemini-2.0-flash";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 180,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const answer = parseGeminiText(payload);
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

  const geminiAnswer = await askGemini(question, summary, history);
  if (geminiAnswer) {
    return {
      answer: sanitizeAssistantResponse(geminiAnswer),
      provider: "gemini",
      context: summary,
    };
  }

  return {
    answer: sanitizeAssistantResponse(buildHeuristicAnswer(question, summary, history, input.transactions)),
    provider: "heuristic",
    context: summary,
  };
}
