"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartDataTable } from "./chart-data-table";

export interface DonutDatum {
  label: string;
  value: number;
}

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Breakdown donut (skill_type / reuse_level). Accessible table alongside. */
export function ProfileDonut({
  data,
  tableCaption,
  categoryLabel,
  valueLabel,
  centerLabel,
}: {
  data: DonutDatum[];
  tableCaption: string;
  categoryLabel: string;
  valueLabel: string;
  centerLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div className="relative h-44" role="img" aria-label={tableCaption}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{total}</span>
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>

      <ChartDataTable
        caption={tableCaption}
        columns={[categoryLabel, valueLabel]}
        rows={data.map((d) => [d.label, d.value])}
      />
    </div>
  );
}
