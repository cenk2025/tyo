"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { ChartDataTable } from "./chart-data-table";

export interface GapLineDatum {
  date: string; // formatted date label
  [occupation: string]: string | number;
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];

/** Match score over time, one line per target occupation. */
export function GapLine({
  data,
  series,
  caption,
  dateLabel,
}: {
  data: Record<string, string | number>[];
  series: string[];
  caption: string;
  dateLabel: string;
}) {
  return (
    <div>
      <div className="h-64" role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value) => `${Math.round(Number(value))}%`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, i) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={caption}
        columns={[dateLabel, ...series]}
        rows={data.map((d) => [
          d.date,
          ...series.map((s) => `${Math.round(Number(d[s]) || 0)}%`),
        ])}
      />
    </div>
  );
}
