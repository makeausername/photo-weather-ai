"use client";

import type { ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type HourlyTimelinePoint = {
  readonly key: string;
  readonly label: string;
  readonly temperatureC: number | null;
  readonly dewPointC: number | null;
  readonly cloudCoverPercent: number | null;
  readonly precipitationMm: number | null;
  readonly precipitationProbabilityPercent: number | null;
  readonly isNight: boolean;
};

export function HourlyWeatherTimeline({
  points,
  title = "逐小时天气趋势",
  description = "同一时间轴对照降水、云量、气温与露点，先看趋势，再按需展开明细。",
  controls,
}: {
  readonly points: readonly HourlyTimelinePoint[];
  readonly title?: string;
  readonly description?: string;
  readonly controls?: ReactNode;
}) {
  if (points.length === 0) {
    return null;
  }

  const nightRanges = buildNightRanges(points);

  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-panel sm:p-5"
      data-hourly-weather-timeline="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {points.length} 小时
        </span>
      </div>

      {controls ? <div className="mt-4 min-w-0">{controls}</div> : null}

      <div className="mt-4 h-[280px] min-w-0 sm:h-[320px]" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 12, right: 2, bottom: 4, left: -18 }}>
            <defs>
              <linearGradient id="hourly-cloud-cover" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--muted-foreground)" stopOpacity={0.24} />
                <stop offset="100%" stopColor="var(--muted-foreground)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
            {nightRanges.map((range) => (
              <ReferenceArea
                key={`${range.start}-${range.end}`}
                x1={range.start}
                x2={range.end}
                yAxisId="percent"
                fill="var(--foreground)"
                fillOpacity={0.035}
              />
            ))}
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              minTickGap={22}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              yAxisId="percent"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              width={42}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              yAxisId="temperature"
              orientation="right"
              axisLine={false}
              tickLine={false}
              width={38}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) => `${value}°`}
            />
            <YAxis yAxisId="rain" hide domain={[0, "auto"]} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.55 }}
              contentStyle={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--card)",
                color: "var(--card-foreground)",
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--card-foreground)", fontWeight: 700 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
            <Area
              yAxisId="percent"
              type="monotone"
              dataKey="cloudCoverPercent"
              name="总云量 %"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              fill="url(#hourly-cloud-cover)"
              connectNulls
            />
            <Bar
              yAxisId="rain"
              dataKey="precipitationMm"
              name="降水 mm"
              fill="var(--info-strong)"
              opacity={0.72}
              maxBarSize={12}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="precipitationProbabilityPercent"
              name="降水概率 %"
              stroke="var(--info-strong)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperatureC"
              name="气温 °C"
              stroke="var(--accent-strong)"
              strokeWidth={2.25}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="dewPointC"
              name="露点 °C"
              stroke="var(--primary)"
              strokeDasharray="4 4"
              strokeWidth={1.75}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        深色背景表示夜间时段；图表用于快速识别趋势，具体数值以专业数据表为准。
      </p>
    </section>
  );
}

function buildNightRanges(points: readonly HourlyTimelinePoint[]) {
  const ranges: Array<{ start: string; end: string }> = [];
  let start: string | null = null;

  points.forEach((point, index) => {
    if (point.isNight && start === null) {
      start = point.label;
    }
    const nextIsNight = points[index + 1]?.isNight ?? false;
    if (start !== null && !nextIsNight) {
      ranges.push({ start, end: point.label });
      start = null;
    }
  });

  return ranges;
}
