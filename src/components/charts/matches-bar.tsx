"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { useRouter } from "@/i18n/navigation";
import { ChartDataTable } from "./chart-data-table";
import { formatPercent } from "@/lib/utils";

export interface MatchBarDatum {
  code: string;
  label: string;
  essentialPct: number; // 0..100 (weighted contribution shown as essential portion)
  optionalPct: number;
  score: number; // 0..1
}

/**
 * Horizontal stacked bars: top occupation matches. Each bar splits essential vs
 * optional coverage; clicking opens the occupation detail page.
 */
export function MatchesBar({
  data,
  locale,
  essentialLabel,
  optionalLabel,
}: {
  data: MatchBarDatum[];
  locale: string;
  essentialLabel: string;
  optionalLabel: string;
}) {
  const router = useRouter();
  const height = Math.max(180, data.length * 38);

  return (
    <div>
      <div style={{ height }} role="img" aria-label={essentialLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
            barCategoryGap={8}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fontSize: 11, fill: "var(--foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${Math.round(Number(value))}%`,
                name === "essentialPct" ? essentialLabel : optionalLabel,
              ]}
            />
            <Bar
              dataKey="essentialPct"
              stackId="cov"
              fill="var(--chart-1)"
              radius={[4, 0, 0, 4]}
              onClick={(d: { payload?: MatchBarDatum }) =>
                d?.payload && router.push(`/occupation/${d.payload.code}`)
              }
              className="cursor-pointer"
            >
              {data.map((entry) => (
                <Cell key={entry.code} />
              ))}
            </Bar>
            <Bar
              dataKey="optionalPct"
              stackId="cov"
              fill="var(--chart-3)"
              radius={[0, 4, 4, 0]}
              onClick={(d: { payload?: MatchBarDatum }) =>
                d?.payload && router.push(`/occupation/${d.payload.code}`)
              }
              className="cursor-pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} />
          {essentialLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-3)" }} />
          {optionalLabel}
        </span>
      </div>

      <ChartDataTable
        caption={essentialLabel}
        columns={["Occupation", essentialLabel, optionalLabel, "Score"]}
        rows={data.map((d) => [
          d.label,
          `${Math.round(d.essentialPct)}%`,
          `${Math.round(d.optionalPct)}%`,
          formatPercent(d.score, locale),
        ])}
      />
    </div>
  );
}
