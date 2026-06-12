"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { ChartDataTable } from "./chart-data-table";

export interface RadarDatum {
  group: string; // skill-group axis label
  [target: string]: string | number;
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"];

/** Spider chart comparing up to 3 target occupations across skill groups. */
export function TargetRadar({
  data,
  targets,
  caption,
  groupLabel,
}: {
  data: RadarDatum[];
  targets: string[];
  caption: string;
  groupLabel: string;
}) {
  return (
    <div>
      <div className="h-72" role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="group"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
            />
            {targets.map((target, i) => (
              <Radar
                key={target}
                name={target}
                dataKey={target}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                fillOpacity={0.18}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
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
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={caption}
        columns={[groupLabel, ...targets]}
        rows={data.map((d) => [
          d.group,
          ...targets.map((t) => `${Math.round(Number(d[t]) || 0)}%`),
        ])}
      />
    </div>
  );
}
