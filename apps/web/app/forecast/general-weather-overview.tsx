"use client";

import React from "react";
import type {
  ForecastCalculationResult,
  ForecastQueryInput,
  ProfessionalHourlyDataPoint,
} from "@photo-weather/shared";
import { forecastHorizonLabels } from "@photo-weather/shared";
import { Badge, Button, Card } from "../../components/ui";
import type { ProfessionalHourlyDisplayData } from "./cloud-sea-display-data";
import { hourlyTableNumber as number } from "./professional-hourly-columns";
import {
  finiteWeatherValue,
  summarizeWeatherHours,
  weatherDateKey,
  weatherDates,
  weatherRowsForDate,
} from "./general-weather-data";
import { buildGeneralForecastReturnUrl } from "./subject-detail-links";

function temperatureRange(min: number | null, max: number | null) {
  return min === max ? `${number(min)}°C` : `${number(min)}–${number(max)}°C`;
}

export function WeatherDateSelector({
  dates,
  value,
  onChange,
}: {
  readonly dates: readonly string[];
  readonly value: string;
  readonly onChange: (date: string) => void;
}) {
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="预报日期">
      {[...dates, "all"].map((date) => (
        <button
          key={date}
          type="button"
          aria-pressed={date === value}
          onClick={() => onChange(date)}
          className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm ${date === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-card-foreground"}`}
        >
          {date === "all" ? "全部时段" : date.slice(5).replace("-", "/")}
        </button>
      ))}
    </div>
  );
}

export function weatherTimeLabel(time: string, timezone: string, includeDate = false) {
  if (!Number.isFinite(Date.parse(time))) return "时间暂缺";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    ...(includeDate ? ({ month: "numeric", day: "numeric" } as const) : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));
}

export function GeneralWeatherHeader({ result }: { readonly result: ForecastCalculationResult }) {
  const current = result.currentWeather;
  const timezone = result.calendarBasis.timezone;
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"
      data-general-weather-header="true"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>天气概览</Badge>
          <span className="text-xs text-muted-foreground">
            {forecastHorizonLabels[result.horizon]}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">{result.place.name}</h1>
        {current ? (
          <p className="mt-2 text-sm text-foreground">
            {current.dataKind === "observation" ? "实况" : "当前预报参考"}{" "}
            {weatherTimeLabel(current.observedAt, timezone, true)} · {number(current.temperature)}°C
            {finiteWeatherValue(current.feelsLike)
              ? ` · 体感 ${number(current.feelsLike)}°C`
              : ""}{" "}
            · 风速 {number(current.windSpeed)} m/s
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">当前实况暂缺，请参考下方预报。</p>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          预报：{weatherTimeLabel(result.forecastStart, timezone, true)}–
          {weatherTimeLabel(result.forecastEnd, timezone, true)} · 更新{" "}
          {weatherTimeLabel(result.generatedAt, timezone, true)}
        </p>
        {result.weatherDataFreshness === "stale" ||
        result.weatherEvidenceStatus === "insufficient" ? (
          <p className="mt-2 text-sm text-warning-strong">
            {result.weatherEvidenceReasonZh || "数据存在缺失或更新延迟，请留意后续预报。"}
          </p>
        ) : null}
      </div>
      <a
        href="/"
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-primary"
      >
        更换地点与范围
      </a>
    </header>
  );
}

export function GeneralWeatherOverview({
  result,
  query,
  data,
  onHour,
  onDate,
}: {
  readonly result: ForecastCalculationResult;
  readonly query: ForecastQueryInput;
  readonly data?: ProfessionalHourlyDisplayData;
  readonly onHour: (time: string) => void;
  readonly onDate: (date: string) => void;
}) {
  const rows = data?.rows ?? [];
  const timezone = data?.timeBasis?.timezone ?? result.calendarBasis.timezone;
  const summary = summarizeWeatherHours(rows, data?.timeBasis);
  const dates = weatherDates(rows, timezone);
  const expected =
    data?.timeBasis?.expectedRowCount ?? data?.timeBasis?.requestedHours ?? rows.length;
  const coverageIncomplete = !rows.length || rows.length < expected || data?.timeBasis?.partialData;
  const risks = result.riskFlags.filter((risk) =>
    ["precipitation", "wind", "visibility", "whiteout", "low_cloud"].includes(risk.key),
  );
  const links = (
    [
      { target: "cloud_sea", label: "云海" },
      { target: "glow", label: "朝霞晚霞" },
      { target: "astro", label: "星空银河" },
    ] as const
  ).map((item) => ({
    ...item,
    href: buildGeneralForecastReturnUrl(query).replace("target=general", `target=${item.target}`),
  }));
  return (
    <div className="grid min-w-0 gap-5" data-general-weather-overview="true">
      <Card className="grid gap-4 p-4 sm:p-5">
        <div>
          <h2 className="text-xl font-semibold">{summary.rainLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {rows.length
              ? `所示预报时段累计降水${summary.amountComplete ? "" : "（已知部分）"} ${number(summary.amount)} mm，最高小时降水概率${summary.probabilityInconsistent ? "待复核" : ` ${number(summary.maxProbability, 0)}%`}。`
              : "暂无可用小时预报。"}
            {summary.rainHours.length
              ? `首个有降水信号的时次为 ${weatherTimeLabel(summary.rainHours[0]!.time, timezone, true)}。`
              : ""}
          </p>
          {coverageIncomplete ? (
            <p className="mt-2 text-xs text-warning-strong">
              预报覆盖不完整：{rows.length} / {expected} 个时次，不能据此排除缺测时段的降水或风险。
            </p>
          ) : null}
          {summary.probabilityInconsistent ? (
            <p className="mt-2 text-xs text-warning-strong">
              部分时次雨量与概率不一致，请按降水信号准备，并在专业数据中核对原始数值。
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          {[
            ["预报温度", temperatureRange(summary.minTemperature, summary.maxTemperature)],
            ["最大风速", `${number(summary.maxWind)} m/s`],
            ["最大阵风", `${number(summary.maxGust)} m/s`],
            [
              "最低能见度",
              `${number(summary.minVisibility === null ? null : summary.minVisibility / 1000)} km`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          以上为所示预报时段统计；降水概率取小时最高值，不代表整段时间的降水概率。
        </p>
      </Card>
      <section aria-label="天气风险" className="grid gap-3">
        <h2 className="text-lg font-semibold">
          天气风险{risks.length ? ` · ${risks.length} 项` : ""}
        </h2>
        {risks.length ? (
          risks.map((risk) => (
            <Card key={risk.key} className="grid gap-2 border-warning/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">
                  {risk.level === "high" ? "高" : risk.level === "medium" ? "中" : "低"}风险
                </Badge>
                <h3 className="font-semibold">{risk.label}</h3>
              </div>
              <p className="text-sm leading-6">{risk.description}</p>
              <p className="text-xs text-muted-foreground">
                {risk.startTime
                  ? `${weatherTimeLabel(risk.startTime, timezone, true)}${risk.endTime ? `–${weatherTimeLabel(risk.endTime, timezone, true)}` : ""}`
                  : risk.timeWindowLabelZh || "影响时段尚不明确"}
              </p>
              {risk.startTime &&
              rows.some(
                (row) =>
                  Date.parse(row.time) >= Date.parse(risk.startTime!) &&
                  (!risk.endTime || Date.parse(row.time) <= Date.parse(risk.endTime)),
              ) ? (
                <button
                  type="button"
                  className="min-h-11 justify-self-start text-sm font-semibold text-primary"
                  onClick={() =>
                    onHour(
                      rows.find((row) => Date.parse(row.time) >= Date.parse(risk.startTime!))!.time,
                    )
                  }
                >
                  查看对应小时 →
                </button>
              ) : null}
            </Card>
          ))
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            {coverageIncomplete
              ? "数据覆盖不完整，暂不能完整评估天气风险。"
              : "当前预报未识别到主要天气风险。"}{" "}
            天气预警与预报风险分别展示，出行前留意最新更新。
          </p>
        )}
      </section>
      {rows.length ? (
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">近期小时预报</h2>
            <Button variant="ghost" size="sm" onClick={() => onDate(dates[0] ?? "all")}>
              查看逐小时 →
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {rows.slice(0, 12).map((row) => (
              <button
                type="button"
                key={row.time}
                onClick={() => onHour(row.time)}
                className="grid min-w-[88px] shrink-0 gap-2 rounded-lg border border-border px-3 py-3 text-center text-xs hover:bg-muted"
              >
                <span className="text-muted-foreground">
                  {weatherTimeLabel(row.time, timezone)}
                </span>
                <span>{row.weatherText || "—"}</span>
                <strong className="text-base">{number(row.displayedTemperatureC)}°</strong>
                <span>{number(row.precipitationAmountMm)} mm</span>
                <span className="text-muted-foreground">
                  {number(row.precipitationProbabilityPercent, 0)}%
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">逐日天气</h2>
        <p className="text-xs text-muted-foreground">
          按所选预报范围内的小时统计；点击日期查看当天变化。
        </p>
        <Card className="divide-y divide-border overflow-hidden">
          {dates.map((date) => {
            const dayRows = weatherRowsForDate(rows, date, timezone);
            const day = summarizeWeatherHours(dayRows, data?.timeBasis);
            return (
              <button
                key={date}
                type="button"
                onClick={() => onDate(date)}
                className="grid w-full gap-3 p-4 text-left hover:bg-muted sm:grid-cols-[1.2fr_1fr_1.3fr_1fr] sm:items-center"
              >
                <span>
                  <strong>{date.slice(5).replace("-", "月")}日</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {weatherTimeLabel(dayRows[0]!.time, timezone)}–
                    {weatherTimeLabel(dayRows.at(-1)!.time, timezone)} · {dayRows.length} 个时次
                  </span>
                </span>
                <span className="text-sm">
                  {temperatureRange(day.minTemperature, day.maxTemperature)}
                </span>
                <span className="text-sm">
                  {day.rainLabel}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {day.amountComplete ? "累计" : "已知部分"} {number(day.amount)} mm ·{" "}
                    {day.probabilityInconsistent
                      ? "概率待复核"
                      : `小时最高 ${number(day.maxProbability, 0)}%`}
                  </span>
                </span>
                <span className="text-sm">
                  最大风 {number(day.maxWind)} m/s
                  <span className="mt-1 block text-xs text-muted-foreground">
                    阵风 {number(day.maxGust)} m/s →
                  </span>
                </span>
              </button>
            );
          })}
          {!dates.length ? (
            <p className="p-4 text-sm text-muted-foreground">暂无可用逐日天气数据。</p>
          ) : null}
        </Card>
      </section>
      <nav
        aria-label="摄影专项预报"
        className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 text-sm"
      >
        <span className="text-muted-foreground">摄影专项</span>
        {links.map((link) => (
          <a key={link.href} href={link.href} className="py-2 font-semibold text-primary">
            {link.label} →
          </a>
        ))}
      </nav>
    </div>
  );
}

export function SelectedWeatherHour({
  rows,
  selectedTime,
  onChange,
  timezone,
}: {
  readonly rows: readonly ProfessionalHourlyDataPoint[];
  readonly selectedTime: string;
  readonly onChange: (time: string) => void;
  readonly timezone: string;
}) {
  const row = rows.find((hour) => hour.time === selectedTime) ?? rows[0];
  if (!row) return null;
  const direction = finiteWeatherValue(row.windDirectionDeg)
    ? `${["北", "东北", "东", "东南", "南", "西南", "西", "西北"][Math.round(row.windDirectionDeg / 45) % 8]}风`
    : "风向暂缺";
  return (
    <Card className="grid gap-3 p-4">
      <label className="flex flex-wrap items-center gap-3 text-sm font-semibold">
        查看时次
        <select
          value={row.time}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 rounded-lg border border-border bg-card px-3 text-card-foreground"
        >
          {rows.map((hour) => (
            <option key={hour.time} value={hour.time}>
              {weatherTimeLabel(hour.time, timezone, true)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm leading-7">
        {row.weatherText || "天气暂缺"} · 温度 {number(row.displayedTemperatureC)}°C · 体感{" "}
        {number(row.bodyFeelTemperatureC)}°C · 降水 {number(row.precipitationAmountMm)} mm /{" "}
        {number(row.precipitationProbabilityPercent, 0)}% · {direction} {number(row.windSpeedMs)}{" "}
        m/s · 阵风 {number(row.windGustMs)} m/s
      </p>
      <p className="text-xs text-muted-foreground">
        {weatherDateKey(row.time, timezone)} · {row.temperatureBasisNoteZh} · — 表示缺测
      </p>
    </Card>
  );
}
