"use client";

import { useId, useState, type ReactNode } from "react";
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
  readonly windSpeedMs?: number | null;
  readonly windGustMs?: number | null;
  readonly feelsLikeC?: number | null;
};

export function HourlyWeatherTimeline({
  points,
  title = "逐小时天气趋势",
  description = "同一时间轴对照降水、云量、气温与露点，先看趋势，再按需展开明细。",
  controls,
  weatherFirst = false,
  onSelectTime,
}: {
  readonly points: readonly HourlyTimelinePoint[];
  readonly title?: string;
  readonly description?: string;
  readonly controls?: ReactNode;
  readonly weatherFirst?: boolean;
  readonly onSelectTime?: (time: string) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [showCloud, setShowCloud] = useState(false);
  const [showWind, setShowWind] = useState(false);
  if (points.length === 0) return null;
  const nightRanges = buildNightRanges(points);
  const dry = points.every(
    (point) => point.precipitationMm === 0 && point.precipitationProbabilityPercent === 0,
  );
  const labels = new Map(points.map((point) => [point.key, point.label]));
  const cloudTrack = { key: "cloud", label: "云层", unit: "%", domain: [0, 100] } as const;
  const tracks = [
    ...(!weatherFirst ? [cloudTrack] : []),
    ...(!weatherFirst || !dry
      ? [{ key: "rain", label: "降水", unit: "mm", domain: [0, "auto"] } as const]
      : []),
    {
      key: "temperature",
      label: weatherFirst ? "气温与体感" : "气温与露点",
      unit: "°C",
      domain: ["auto", "auto"],
    },
    ...(weatherFirst && showWind
      ? [{ key: "wind", label: "风速与阵风", unit: "m/s", domain: [0, "auto"] } as const]
      : []),
    ...(weatherFirst && showCloud ? [cloudTrack] : []),
  ] as const;
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5"
      data-hourly-weather-timeline="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs text-muted-foreground">{points.length} 个时次</span>
      </div>
      {controls ? <div className="mt-4 min-w-0">{controls}</div> : null}
      {weatherFirst && dry ? (
        <p
          className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm"
          data-dry-hourly-summary="true"
        >
          所示时次暂无降水信号 · 雨量 0 mm，小时概率 0%
        </p>
      ) : null}
      {weatherFirst ? (
        <div className="flex flex-wrap gap-5">
          <button
            type="button"
            aria-expanded={showWind}
            onClick={() => setShowWind(!showWind)}
            className="mt-2 min-h-11 text-sm font-semibold text-primary"
          >
            {showWind ? "收起风速趋势" : "查看风速与阵风"}
          </button>
          <button
            type="button"
            aria-expanded={showCloud}
            onClick={() => setShowCloud(!showCloud)}
            className="mt-2 min-h-11 text-sm font-semibold text-primary"
          >
            {showCloud ? "收起云量趋势" : "查看云量趋势"}
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid min-w-0 gap-3" aria-label={title}>
        {tracks.map((track) => (
          <div key={track.key} className="min-w-0" data-hourly-track={track.key}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {track.label}{" "}
              <span className="font-normal">
                / {track.unit}
                {track.key === "rain" ? " · 右轴为概率 %" : ""}
              </span>
            </p>
            <div className="h-[180px] min-w-0 sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={points}
                  syncId={id}
                  margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
                  accessibilityLayer
                  onClick={(state) => {
                    if (state?.activeLabel && onSelectTime) onSelectTime(String(state.activeLabel));
                  }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  {nightRanges.map((range) => (
                    <ReferenceArea
                      key={range.start}
                      x1={range.start}
                      x2={range.end}
                      yAxisId="value"
                      fill="var(--foreground)"
                      fillOpacity={0.035}
                    />
                  ))}
                  <XAxis
                    dataKey="key"
                    tickFormatter={(key) => labels.get(String(key)) ?? String(key)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={30}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="value"
                    domain={[...track.domain]}
                    width={48}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="probability"
                    orientation="right"
                    domain={[0, 100]}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(value) => (track.key === "rain" ? `${value}%` : "")}
                  />
                  <Tooltip
                    labelFormatter={(key) => labels.get(String(key)) ?? String(key)}
                    cursor={{ stroke: "var(--info)", strokeDasharray: "3 3" }}
                    contentStyle={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--card)",
                      color: "var(--card-foreground)",
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "var(--card-foreground)", fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  {track.key === "cloud" ? (
                    <Area
                      yAxisId="value"
                      type="linear"
                      dataKey="cloudCoverPercent"
                      name="总云量 %"
                      stroke="var(--info)"
                      fill="var(--info)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                  {track.key === "rain" ? (
                    <>
                      <Bar
                        yAxisId="value"
                        dataKey="precipitationMm"
                        name="降水 mm"
                        fill="var(--info)"
                        maxBarSize={16}
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="probability"
                        type="linear"
                        dataKey="precipitationProbabilityPercent"
                        name="降水概率 %"
                        stroke="var(--primary)"
                        strokeDasharray="5 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </>
                  ) : null}
                  {track.key === "temperature" ? (
                    <>
                      <Line
                        yAxisId="value"
                        type="linear"
                        dataKey="temperatureC"
                        name="气温 °C"
                        stroke="var(--accent-strong)"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="value"
                        type="linear"
                        dataKey={weatherFirst ? "feelsLikeC" : "dewPointC"}
                        name={weatherFirst ? "体感 °C" : "露点 °C"}
                        stroke="var(--info)"
                        strokeDasharray="5 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </>
                  ) : null}
                  {track.key === "wind" ? (
                    <>
                      <Line
                        yAxisId="value"
                        type="linear"
                        dataKey="windSpeedMs"
                        name="风速 m/s"
                        stroke="var(--primary)"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="value"
                        type="linear"
                        dataKey="windGustMs"
                        name="阵风 m/s"
                        stroke="var(--accent-strong)"
                        strokeDasharray="5 4"
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </>
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        深色背景表示夜间。各图共用时间轴，断线表示数据缺失；降水量与概率分别读左右轴。具体数值以专业数据表为准。
      </p>
    </section>
  );
}

function buildNightRanges(points: readonly HourlyTimelinePoint[]) {
  const ranges: Array<{ start: string; end: string }> = [];
  let start: string | null = null;
  points.forEach((point, index) => {
    if (point.isNight && start === null) start = point.key;
    if (start !== null && !(points[index + 1]?.isNight ?? false)) {
      ranges.push({ start, end: point.key });
      start = null;
    }
  });
  return ranges;
}
