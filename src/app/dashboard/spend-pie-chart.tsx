"use client";

export type CategoryBreakdown = {
  category: string;
  amount: number;
};

export interface SpendPieChartProps {
  breakdown: CategoryBreakdown[];
  wafflePalette: Record<string, string>;
}

export function SpendPieChart({ breakdown, wafflePalette }: SpendPieChartProps) {
  const rows = breakdown
    .map((row) => ({ category: row.category, amount: Number(row.amount) || 0 }))
    .filter((row) => row.amount > 0);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  const gradientStops: string[] = [];
  let start = 0;
  rows.forEach((row) => {
    const color = wafflePalette[row.category] ?? "#94a3b8";
    const slice = (row.amount / total) * 100;
    const end = start + slice;
    gradientStops.push(`${color} ${start}% ${end}%`);
    start = end;
  });

  const donutBackground =
    total > 0
      ? `conic-gradient(${gradientStops.join(", ")})`
      : "conic-gradient(#334155 0% 100%)";

  return (
    <div className="mt-4 grid gap-4 touch-manipulation sm:grid-cols-[200px_1fr] sm:items-center">
      <div className="mx-auto flex aspect-square w-full max-w-[200px] min-w-[140px] items-center justify-center rounded-full border border-indigo-300/35 bg-slate-950/20 p-4">
        <div
          className="relative h-full w-full rounded-full"
          style={{ background: donutBackground }}
        >
          <div className="absolute inset-[26%] flex items-center justify-center rounded-full bg-slate-950/95 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-300">Total</p>
              <p className="text-sm font-semibold text-slate-100">INR {total.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {(rows.length > 0 ? rows : [{ category: "No spend", amount: 0 }]).map((row) => (
          <li
            className="flex items-center justify-between rounded-md border border-slate-300/30 bg-slate-950/25 px-3 py-2 text-sm"
            key={row.category}
          >
            <span className="inline-flex items-center gap-2 text-slate-200">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: wafflePalette[row.category] ?? "#64748b" }}
              />
              {row.category}
            </span>
            <span className="font-medium text-slate-100">INR {row.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
