"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cloudConsistentWeatherText,
  type ProfessionalHourlyDataPoint,
} from "@photo-weather/shared";
import { StickyDataScroller } from "../../components/sticky-data-scroller";
import { hourlyTableNumber } from "./professional-hourly-columns";
import { weatherDateKey, providerNeutralProfessionalWeatherText } from "./general-weather-data";

type Hour = ProfessionalHourlyDataPoint;
type Visibility = {
  showWeatherColumn?: boolean;
  showSignalColumn?: boolean;
  showCloudColumns?: boolean;
  showTemperatureColumns?: boolean;
  showDewPointColumns?: boolean;
  showHumidityColumn?: boolean;
  showPrecipitationColumns?: boolean;
  showVisibilityColumn?: boolean;
  showWindColumns?: boolean;
};
type Metric = {
  key: string;
  label: string;
  unit?: string;
  value: (hour: Hour) => string;
  cloud?: keyof Hour;
};

export function weatherMatrixMetrics(
  config: Visibility,
  temperatureLabel: string,
  raw: boolean,
): Metric[] {
  const numeric = (key: keyof Hour, label: string, unit: string, precision = 1): Metric => ({
    key,
    label,
    unit,
    value: (h) =>
      hourlyTableNumber(typeof h[key] === "number" ? (h[key] as number) : null, precision),
  });
  return [
    ...(config.showWeatherColumn !== false
      ? [
          {
            key: "weather",
            label: "天气",
            value: (h: Hour) =>
              cloudConsistentWeatherText(providerNeutralProfessionalWeatherText(h.weatherText), [
                h.cloudTotalPercent,
                h.cloudLowPercent,
                h.cloudMidPercent,
                h.cloudHighPercent,
              ]) || "—",
          },
        ]
      : []),
    ...(config.showTemperatureColumns !== false
      ? [numeric("displayedTemperatureC", temperatureLabel.replace(/ °C$/, ""), "°C")]
      : []),
    ...(config.showPrecipitationColumns !== false
      ? [
          numeric("precipitationAmountMm", "降水", "mm", 2),
          numeric("precipitationProbabilityPercent", "降水概率", "%", 0),
        ]
      : []),
    ...(config.showWindColumns !== false
      ? [
          numeric("windSpeedMs", "风速", "m/s"),
          numeric("windGustMs", "阵风", "m/s"),
          {
            key: "windDirectionDeg",
            label: "风向",
            value: (h: Hour) => {
              const degrees = h.windDirectionDeg;
              return typeof degrees === "number" && Number.isFinite(degrees)
                ? ["北", "东北", "东", "东南", "南", "西南", "西", "西北"][
                    Math.round((((degrees % 360) + 360) % 360) / 45) % 8
                  ]!
                : "—";
            },
          },
        ]
      : []),
    ...(config.showVisibilityColumn !== false
      ? [
          {
            key: "visibilityMeters",
            label: "能见度",
            unit: "km",
            value: (h: Hour) =>
              hourlyTableNumber(
                typeof h.visibilityMeters === "number" ? h.visibilityMeters / 1000 : null,
              ),
          },
        ]
      : []),
    ...(config.showCloudColumns !== false
      ? (
          [
            ["cloudTotalPercent", "总云"],
            ["cloudHighPercent", "高云"],
            ["cloudMidPercent", "中云"],
            ["cloudLowPercent", "低云"],
          ] as const
        ).map(([key, label]) => ({ ...numeric(key, label, "%", 0), cloud: key }))
      : []),
    ...(raw && config.showTemperatureColumns !== false
      ? [numeric("rawTemperatureC", "原始格点气温", "°C")]
      : []),
    ...(config.showDewPointColumns !== false
      ? [numeric("dewPointC", "露点", "°C"), numeric("dewPointSpreadC", "露点差", "°C")]
      : []),
    ...(config.showHumidityColumn !== false
      ? [numeric("relativeHumidityPercent", "湿度", "%", 0)]
      : []),
  ];
}

export function HourlyWeatherMatrix({
  rows,
  timezone,
  config,
  temperatureLabel,
  showRawTemperature,
  selectedTime,
  annotations,
  onSelectTime,
}: {
  readonly rows: readonly Hour[];
  readonly timezone: string;
  readonly config: Visibility;
  readonly temperatureLabel: string;
  readonly showRawTemperature: boolean;
  readonly selectedTime?: string;
  readonly annotations?: ReadonlyMap<string, { readonly label: string; readonly tone?: string }>;
  readonly onSelectTime?: (time: string) => void;
}) {
  const [focused, setFocused] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const firstTime = rows[0]?.time;
  useEffect(() => {
    root.current?.querySelector("[data-responsive-data-scroller]")?.scrollTo({ left: 0 });
  }, [firstTime]);
  useEffect(() => {
    setFocused("");
  }, [selectedTime]);
  const metrics = weatherMatrixMetrics(config, temperatureLabel, showRawTemperature);
  const selected = rows.find((row) => row.time === (focused || selectedTime));
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (!rows.length)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        当前筛选下暂无小时数据，请调整日期或时段。
      </p>
    );
  return (
    <div ref={root} className="min-w-0" data-hourly-weather-matrix="true">
      <StickyDataScroller showHint={false}>
        <table
          className="weather-matrix w-full table-fixed border-separate border-spacing-0 text-center text-[13px] tabular-nums"
          style={{ minWidth: 88 + rows.length * 58 }}
        >
          <caption className="sr-only">
            逐小时天气矩阵，时间从左向右，指标从上向下；点击时间查看详情。
          </caption>
          <colgroup>
            <col style={{ width: 88 }} />
            {rows.map((row) => (
              <col key={row.time} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="matrix-label bg-muted px-2 text-left text-xs font-medium text-muted-foreground"
              >
                日期 / 时间
              </th>
              {rows.map((row, index) => {
                const date = weatherDateKey(row.time, timezone);
                const startsDay =
                  index === 0 || date !== weatherDateKey(rows[index - 1]!.time, timezone);
                return (
                  <th
                    key={row.time}
                    scope="col"
                    className={`border-b border-r border-border bg-muted p-0 font-semibold ${startsDay ? "border-l border-l-primary/30" : ""}`}
                    data-matrix-time={row.time}
                  >
                    <button
                      type="button"
                      aria-label={`${date} ${formatter.format(new Date(row.time))} 小时详情`}
                      aria-pressed={row.time === (focused || selectedTime)}
                      onClick={() => {
                        setFocused(row.time);
                        onSelectTime?.(row.time);
                      }}
                      className="grid min-h-[60px] w-full gap-1 px-1 py-2 text-center hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    >
                      <span className="text-[10px] font-normal opacity-70">
                        {date.slice(5).replace("-", "/")}
                      </span>
                      <span>{formatter.format(new Date(row.time))}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.key} data-matrix-metric={metric.key}>
                <th
                  scope="row"
                  className="matrix-label border-b border-border bg-card px-2 py-2 text-left text-xs font-medium"
                >
                  {metric.label}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {metric.unit}
                  </span>
                </th>
                {rows.map((row) => {
                  const cloud = metric.cloud ? row[metric.cloud] : null;
                  const rain =
                    metric.key === "precipitationAmountMm" && (row.precipitationAmountMm ?? 0) > 0;
                  const style: CSSProperties =
                    typeof cloud === "number" && Number.isFinite(cloud)
                      ? {
                          backgroundColor: `color-mix(in srgb, var(--info) ${5 + Math.max(0, Math.min(100, cloud)) * 0.2}%, var(--card))`,
                        }
                      : {};
                  return (
                    <td
                      key={row.time}
                      style={style}
                      data-matrix-value={row.time}
                      className={`h-11 border-b border-r border-border/60 px-1 py-2 ${row.time === (focused || selectedTime) ? "bg-secondary" : rain ? "bg-info/10" : ""}`}
                    >
                      <span className={metric.key === "weather" ? "text-xs" : ""}>
                        {metric.value(row)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {config.showSignalColumn !== false && annotations?.size ? (
              <tr>
                <th
                  scope="row"
                  className="matrix-label border-b border-border bg-card px-2 py-2 text-left text-xs font-medium"
                >
                  窗口提示
                </th>
                {rows.map((row) => (
                  <td
                    key={row.time}
                    className="border-b border-r border-border/60 px-1 py-2 text-[10px] leading-4 text-muted-foreground"
                  >
                    <span className="line-clamp-2" title={annotations.get(row.time)?.label}>
                      {annotations.get(row.time)?.label || "—"}
                    </span>
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </StickyDataScroller>
      {selected ? (
        <div className="mt-3 rounded-lg bg-muted p-3 text-sm" role="status">
          <strong>
            {weatherDateKey(selected.time, timezone)} {formatter.format(new Date(selected.time))}
          </strong>
          <p className="mt-1 leading-6">
            {metrics
              .map((metric) => `${metric.label} ${metric.value(selected)}${metric.unit ?? ""}`)
              .join(" · ")}
          </p>
          {config.showSignalColumn !== false && annotations?.get(selected.time)?.label ? (
            <p className="mt-1">{annotations.get(selected.time)?.label}</p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        左右滑动看时次，点击时间看详情 · 云量底色表示多少 · — 为缺测
      </p>
    </div>
  );
}
