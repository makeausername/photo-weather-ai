import type { ForecastCalculationResult } from "@photo-weather/shared";
import {
  buildGeneralHourlyRowAnnotations,
  type GeneralHourlyRowAnnotation,
} from "../app/forecast/general-hourly-window-annotations";
import { Badge, Card, ResponsiveDataScroller } from "./ui";

type HourlyRow = NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number];

export function HomepageHourlyWeather({
  result,
}: {
  readonly result: ForecastCalculationResult;
}) {
  const rows = selectFutureHourlyRows(result);
  const previewRows = rows.slice(0, 12);
  const annotations = new Map(
    buildGeneralHourlyRowAnnotations(result, rows).map((item) => [item.rowTime, item]),
  );

  return (
    <Card className="min-w-0 p-5" data-homepage-hourly-weather="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-card-foreground">未来小时天气</h3>
            <Badge variant="accent">降水与拍摄窗口</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            优先查看未来逐小时降雨量和降雨概率，并套用朝霞、晚霞、星空与银河的小时窗口逻辑。
          </p>
        </div>
        {rows.length > 0 ? <Badge variant="muted">共 {rows.length} 小时</Badge> : null}
      </div>

      {rows.length === 0 ? (
        <p
          className="mt-4 rounded-lg border border-warning/40 bg-accent/10 px-3 py-3 text-sm leading-6 text-muted-foreground"
          data-homepage-hourly-empty="true"
        >
          本次综合判断没有返回可显示的小时数据，请重新分析或检查天气数据源状态。
        </p>
      ) : (
        <>
          <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {previewRows.map((row) => (
              <HomepageHourlyPreviewRow
                key={row.time}
                row={row}
                annotation={annotations.get(row.time)}
              />
            ))}
          </div>

          <details className="mt-4 rounded-lg border border-border bg-muted/30">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-card-foreground">
              展开完整 {rows.length} 小时表
            </summary>
            <div className="border-t border-border p-3">
              <ResponsiveDataScroller data-homepage-hourly-table-scroll="true">
                <table className="w-full min-w-[820px] text-left text-xs leading-5">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      {[
                        "日期",
                        "时间",
                        "天气",
                        "拍摄窗口",
                        "降水量",
                        "降水概率",
                        "总云量",
                        "风速",
                      ].map((label) => (
                        <th key={label} className="whitespace-nowrap border-b border-border px-3 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const annotation = annotations.get(row.time);
                      return (
                        <tr key={row.time} className="odd:bg-card even:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">
                            {row.dateLabel}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">
                            {row.timeLabel}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">{row.weatherText || "—"}</td>
                          <td className="min-w-40 px-3 py-2">
                            <HourlyWindowBadges annotation={annotation} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatMillimeters(row.precipitationAmountMm)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatPercent(row.precipitationProbabilityPercent)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatPercent(row.cloudTotalPercent)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatSpeed(row.windSpeedMs)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ResponsiveDataScroller>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

function HomepageHourlyPreviewRow({
  row,
  annotation,
}: {
  readonly row: HourlyRow;
  readonly annotation: GeneralHourlyRowAnnotation | undefined;
}) {
  return (
    <article
      className="min-w-0 rounded-lg border border-border bg-card p-3"
      data-homepage-hourly-preview-row="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-card-foreground">
          {row.dateLabel} {row.timeLabel}
        </span>
        <span className="text-xs text-muted-foreground">{row.weatherText || "—"}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <HourlyWindowBadges annotation={annotation} />
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        降水 {formatMillimeters(row.precipitationAmountMm)} / {formatPercent(row.precipitationProbabilityPercent)}
        {" · "}总云量 {formatPercent(row.cloudTotalPercent)}{" · "}风速 {formatSpeed(row.windSpeedMs)}
      </p>
    </article>
  );
}

function HourlyWindowBadges({
  annotation,
}: {
  readonly annotation: GeneralHourlyRowAnnotation | undefined;
}) {
  const badges = annotation?.badges ?? (annotation ? [annotation] : []);
  if (badges.length === 0) {
    return <span className="text-xs text-muted-foreground">普通时段</span>;
  }

  return (
    <>
      {badges.map((badge) => (
        <span key={badge.label} title={badge.detail}>
          <Badge variant={badge.tone ?? "default"}>{badge.label}</Badge>
        </span>
      ))}
    </>
  );
}

function formatMillimeters(value: number | null | undefined): string {
  return finiteNumber(value) ? `${formatNumber(value)} mm` : "—";
}

function formatPercent(value: number | null | undefined): string {
  return finiteNumber(value) ? `${Math.round(value)}%` : "—";
}

function formatSpeed(value: number | null | undefined): string {
  return finiteNumber(value) ? `${formatNumber(value)} m/s` : "—";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function selectFutureHourlyRows(result: ForecastCalculationResult): readonly HourlyRow[] {
  const rows = [...(result.professionalHourlyData ?? [])]
    .map((row) => ({ row, timestamp: Date.parse(row.time) }))
    .filter(
      (item): item is { readonly row: HourlyRow; readonly timestamp: number } =>
        Number.isFinite(item.timestamp),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const basis = result.professionalHourlyDataTimeBasis;
  const anchorTimestamp = firstValidTimestamp(
    basis?.anchorStartLocal,
    result.forecastStart,
    result.generatedAt,
  );
  const expectedRows = Math.max(
    1,
    basis?.expectedRowCount ?? basis?.requestedHours ?? rows.length,
  );

  return rows
    .filter((item) => anchorTimestamp === null || item.timestamp >= anchorTimestamp - 60_000)
    .slice(0, expectedRows)
    .map((item) => item.row);
}

function firstValidTimestamp(...values: readonly (string | undefined)[]): number | null {
  for (const value of values) {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  return null;
}
