export type ClassifiedTransaction = {
  id: string;
  amount: number;
  date: string;
  category: string | null;
  aiClassification: "wise" | "useless";
};

type SummaryWindow = {
  start: Date;
  end: Date;
  rows: ClassifiedTransaction[];
};

export type HabitInsight = {
  id: string;
  title: string;
  text: string;
  impact: string;
};

export type HabitInsightsResult = {
  isSufficientHistory: boolean;
  sampleSize: number;
  periodLabel: string;
  insights: HabitInsight[];
};

function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function windowRows(
  rows: ClassifiedTransaction[],
  now: Date,
  days: number,
  offsetDays = 0,
): SummaryWindow {
  const end = startOfDay(new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000));
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const filtered = rows.filter((row) => {
    const at = new Date(row.date);
    return at >= start && at < end;
  });

  return { start, end, rows: filtered };
}

function uselessByCategory(rows: ClassifiedTransaction[]) {
  const map = new Map<string, { count: number; amount: number }>();

  for (const row of rows) {
    if (row.aiClassification !== "useless") {
      continue;
    }

    const category = row.category?.trim() || "Uncategorized";
    const current = map.get(category) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += row.amount;
    map.set(category, current);
  }

  return [...map.entries()]
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.amount - a.amount);
}

function uselessShare(rows: ClassifiedTransaction[]) {
  const classified = rows.length;
  if (classified === 0) {
    return 0;
  }
  const useless = rows.filter((row) => row.aiClassification === "useless").length;
  return Math.round((useless / classified) * 100);
}

export function buildHabitTrendInsights(rows: ClassifiedTransaction[]): HabitInsightsResult {
  const now = new Date();
  const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length < 6) {
    return {
      isSufficientHistory: false,
      sampleSize: sorted.length,
      periodLabel: "Last 30 days",
      insights: [],
    };
  }

  const current30 = windowRows(sorted, now, 30, 0);
  const previous30 = windowRows(sorted, now, 30, 30);

  const currentUseless = uselessByCategory(current30.rows);
  const previousUseless = uselessByCategory(previous30.rows);

  const currentTop = currentUseless[0];
  const previousTopForCategory = currentTop
    ? previousUseless.find((entry) => entry.category === currentTop.category)
    : undefined;

  const trendDelta = currentTop
    ? currentTop.amount - (previousTopForCategory?.amount ?? 0)
    : 0;

  const currentUselessShare = uselessShare(current30.rows);
  const previousUselessShare = uselessShare(previous30.rows);

  const shareDelta = currentUselessShare - previousUselessShare;

  const insights: HabitInsight[] = [];

  if (currentTop) {
    const direction = trendDelta > 0 ? "up" : trendDelta < 0 ? "down" : "flat";
    const adjustmentText =
      direction === "up"
        ? `This is ${inr(Math.abs(trendDelta))} higher than the previous 30-day period.`
        : direction === "down"
          ? `This is ${inr(Math.abs(trendDelta))} lower than the previous 30-day period.`
          : "This is similar to the previous 30-day period.";

    insights.push({
      id: "top-useless-category",
      title: `Top recurring waste pattern: ${currentTop.category}`,
      text: `${currentTop.count} transactions were marked useless in this category over the last 30 days, totaling ${inr(
        currentTop.amount,
      )}. ${adjustmentText}`,
      impact: `If you trim one ${currentTop.category.toLowerCase()} purchase per week, you could reduce monthly spend by about ${inr(
        currentTop.amount / Math.max(currentTop.count, 1) * 4,
      )}.`,
    });
  }

  insights.push({
    id: "useless-share-trend",
    title: "Wise vs useless trend",
    text: `In the last 30 days, ${currentUselessShare}% of classified transactions were marked useless (${current30.rows.length} classified records).`,
    impact:
      shareDelta > 0
        ? `This is ${shareDelta} percentage points higher than the previous period. Try pre-planning high-risk spends this week.`
        : shareDelta < 0
          ? `This is ${Math.abs(shareDelta)} percentage points lower than the previous period. Your recent choices are trending better.`
          : "This is unchanged from the previous period. A small weekly adjustment can improve this trend.",
  });

  const recent7 = windowRows(sorted, now, 7, 0);
  const useless7Amount = recent7.rows
    .filter((row) => row.aiClassification === "useless")
    .reduce((sum, row) => sum + row.amount, 0);

  insights.push({
    id: "weekly-focus",
    title: "Next 7-day focus",
    text: `You logged ${recent7.rows.length} classified transactions in the last 7 days, with ${inr(
      useless7Amount,
    )} flagged as useless spend.`,
    impact: `Set a one-week cap below ${inr(
      Math.max(0, useless7Amount * 0.8),
    )} for discretionary spends to build immediate savings momentum.`,
  });

  return {
    isSufficientHistory: true,
    sampleSize: sorted.length,
    periodLabel: "Last 30 days",
    insights,
  };
}
