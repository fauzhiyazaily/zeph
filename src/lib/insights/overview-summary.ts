import { periodBounds } from "@/lib/insights/category-breakdown";

export type SummarySpendRow = {
  amount: number;
  date: string;
};

export type WeeklyTrendPoint = {
  day: string;
  amount: number;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function sumSpend(rows: SummarySpendRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

export function computeWeekSpendComparison(rows: SummarySpendRow[], now = new Date()) {
  const currentBounds = periodBounds(7, now, 0);
  const previousBounds = periodBounds(7, now, 7);

  const thisWeekTotal = rows
    .filter((row) => {
      const at = new Date(row.date);
      return at >= currentBounds.start && at < currentBounds.end;
    })
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const lastWeekTotal = rows
    .filter((row) => {
      const at = new Date(row.date);
      return at >= previousBounds.start && at < previousBounds.end;
    })
    .reduce((sum, row) => sum + Number(row.amount), 0);

  const weekSpendDeltaPct = lastWeekTotal > 0
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : null;

  const weekSpendDeltaAbs = lastWeekTotal > 0
    ? Math.abs(Math.round(thisWeekTotal - lastWeekTotal))
    : null;

  return {
    thisWeekTotal,
    lastWeekTotal,
    weekSpendDeltaPct,
    weekSpendDeltaAbs,
  };
}

export function buildWeeklyTrendData(rows: SummarySpendRow[], chartWindowEnd: Date): WeeklyTrendPoint[] {
  const weeklySpendMap = new Map<string, WeeklyTrendPoint>();
  const trendWindowStart = new Date(chartWindowEnd);
  trendWindowStart.setUTCDate(trendWindowStart.getUTCDate() - 7);

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(trendWindowStart);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    weeklySpendMap.set(key, {
      day: WEEKDAY_LABELS[date.getUTCDay()],
      amount: 0,
    });
  }

  rows.forEach((row) => {
    const date = new Date(row.date);
    if (date < trendWindowStart || date >= chartWindowEnd) {
      return;
    }

    const key = date.toISOString().slice(0, 10);
    const existing = weeklySpendMap.get(key);
    if (!existing) {
      return;
    }

    existing.amount += Number(row.amount);
  });

  return Array.from(weeklySpendMap.values());
}