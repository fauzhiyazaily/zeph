export type BreakdownRow = {
  category: string;
  amount: number;
};

export type SpendRecord = {
  amount: number;
  category: string | null;
  date: string;
};

export function periodBounds(days: number, now = new Date(), offsetDays = 0) {
  const end = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function buildCategoryBreakdown(
  rows: SpendRecord[],
  start: Date,
  end: Date,
  maxCategories = 5,
): BreakdownRow[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const at = new Date(row.date);
    if (at < start || at >= end) {
      continue;
    }

    const category = row.category?.trim() || "Uncategorized";
    totals.set(category, (totals.get(category) ?? 0) + row.amount);
  }

  const sorted = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length <= maxCategories) {
    return sorted;
  }

  const top = sorted.slice(0, maxCategories);
  const otherTotal = sorted.slice(maxCategories).reduce((sum, row) => sum + row.amount, 0);

  return [...top, { category: "Other", amount: otherTotal }];
}

export function buildWaffleCells(rows: BreakdownRow[], cells = 40) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) {
    return [] as Array<{ category: string; index: number }>;
  }

  const counts = rows.map((row) => ({
    category: row.category,
    count: Math.max(1, Math.round((row.amount / total) * cells)),
  }));

  let assigned = counts.reduce((sum, row) => sum + row.count, 0);
  while (assigned > cells) {
    const largest = counts.sort((a, b) => b.count - a.count)[0];
    if (!largest || largest.count <= 1) {
      break;
    }
    largest.count -= 1;
    assigned -= 1;
  }
  while (assigned < cells && counts.length > 0) {
    counts[assigned % counts.length].count += 1;
    assigned += 1;
  }

  const output: Array<{ category: string; index: number }> = [];
  let idx = 0;
  for (const row of counts) {
    for (let i = 0; i < row.count; i += 1) {
      output.push({ category: row.category, index: idx });
      idx += 1;
    }
  }

  return output.slice(0, cells);
}
