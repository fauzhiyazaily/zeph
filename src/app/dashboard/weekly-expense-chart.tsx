"use client";

export type WeeklyExpensePoint = {
  day: string;
  amount: number;
};

type WeeklyExpenseChartProps = {
  data: WeeklyExpensePoint[];
};

export function WeeklyExpenseChart({ data }: WeeklyExpenseChartProps) {
  const safeData = data.length > 0
    ? data
    : [
        { day: "Mon", amount: 0 },
        { day: "Tue", amount: 0 },
        { day: "Wed", amount: 0 },
        { day: "Thu", amount: 0 },
        { day: "Fri", amount: 0 },
        { day: "Sat", amount: 0 },
        { day: "Sun", amount: 0 },
      ];

  const maxAmount = Math.max(...safeData.map((item) => Number(item.amount) || 0), 1);

  return (
    <div className="h-64 w-full rounded-xl border border-indigo-300/25 bg-slate-950/20 p-3">
      <div className="grid h-full grid-cols-7 items-end gap-2">
        {safeData.map((point) => {
          const value = Number(point.amount) || 0;
          const barHeightPct = Math.max(8, Math.round((value / maxAmount) * 100));

          return (
            <div className="flex h-full flex-col items-center justify-end" key={point.day}>
              <div className="mb-2 text-[10px] text-slate-300/85">
                INR {value.toFixed(0)}
              </div>
              <div className="flex h-40 w-full items-end justify-center rounded-md bg-slate-900/55 px-1">
                <div
                  className="w-full rounded-sm bg-gradient-to-t from-cyan-400 to-indigo-400"
                  style={{ height: `${barHeightPct}%` }}
                  title={`${point.day}: INR ${value.toFixed(2)}`}
                />
              </div>
              <div className="mt-2 text-xs font-medium text-slate-200">{point.day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
