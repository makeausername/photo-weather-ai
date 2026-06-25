"use client";

import { useId, useMemo, useState } from "react";
import {
  buildMoonCalendarMonth,
  getCurrentMoonCalendarMonthKey,
  shiftMoonCalendarMonth,
  type MoonCalendarDay,
  type MoonCalendarMonthKey,
} from "@photo-weather/astro";
import { Badge, Button, Card, cn } from "./ui";

const defaultTimezone = "Asia/Shanghai";
const weekLabels = ["一", "二", "三", "四", "五", "六", "日"] as const;
const fullMoonShadowPath = "M 5 50 A 45 45 0 1 0 95 50 A 45 45 0 1 0 5 50";
const compactMoonPhaseNames: Record<MoonCalendarDay["phaseNameZh"], string> = {
  新月: "新月",
  娥眉月: "娥眉",
  上弦月: "上弦",
  盈凸月: "盈凸",
  满月: "满月",
  亏凸月: "亏凸",
  下弦月: "下弦",
  残月: "残月",
};

type MoonPhaseCalendarProps = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly timezone?: string;
  readonly className?: string;
  readonly initialYear?: number;
  readonly initialMonth?: number;
  readonly today?: string | Date | number;
};

export function MoonPhaseCalendar({
  latitudeWgs84,
  longitudeWgs84,
  timezone = defaultTimezone,
  className,
  initialYear,
  initialMonth,
  today,
}: MoonPhaseCalendarProps) {
  const currentMonth = useMemo(
    () => getCurrentMoonCalendarMonthKey(timezone, today ?? new Date()),
    [timezone, today],
  );
  const [visibleMonth, setVisibleMonth] = useState<MoonCalendarMonthKey>(() => ({
    year: initialYear ?? currentMonth.year,
    month: initialMonth ?? currentMonth.month,
  }));
  const calendar = useMemo(
    () =>
      buildMoonCalendarMonth({
        latitudeWgs84,
        longitudeWgs84,
        year: visibleMonth.year,
        month: visibleMonth.month,
        timezone,
        today,
      }),
    [latitudeWgs84, longitudeWgs84, timezone, today, visibleMonth],
  );
  const isCurrentMonth =
    visibleMonth.year === currentMonth.year && visibleMonth.month === currentMonth.month;

  function shiftMonth(offset: number) {
    setVisibleMonth((month) => shiftMoonCalendarMonth(month.year, month.month, offset));
  }

  return (
    <Card className={cn("max-w-full min-w-0 overflow-hidden p-3 shadow-sm sm:p-5", className)}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-card-foreground">月相日历</h2>
            <Badge variant={isCurrentMonth ? "default" : "muted"}>
              {isCurrentMonth ? "本月" : calendar.titleZh}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            基于本地天文算法逐日计算月相和月亮照明，适合星空与银河拍摄前快速查看月光影响。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button className="w-full" variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>
            上个月
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            size="sm"
            onClick={() => setVisibleMonth(currentMonth)}
          >
            回到本月
          </Button>
          <Button className="w-full" variant="secondary" size="sm" onClick={() => shiftMonth(1)}>
            下个月
          </Button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoonSummaryItem label="本月新月" day={calendar.summary.newMoon} />
        <MoonSummaryItem label="本月满月" day={calendar.summary.fullMoon} />
        <MoonSummaryItem label="上弦月" day={calendar.summary.firstQuarter} />
        <MoonSummaryItem label="下弦月" day={calendar.summary.lastQuarter} />
      </div>

      <div className="mt-5 w-full max-w-full min-w-0 rounded-lg border border-border bg-muted p-1 min-[390px]:p-1.5 sm:p-3">
        <div className="grid min-w-0 grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-muted-foreground min-[390px]:gap-1 min-[390px]:text-xs">
          {weekLabels.map((label) => (
            <span key={label} className="py-1">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-1.5 grid min-w-0 grid-cols-7 gap-0.5 min-[390px]:mt-2 min-[390px]:gap-1">
          {Array.from({ length: calendar.firstDayOfWeek }, (_, index) => (
            <span
              key={`empty-${index}`}
              aria-hidden="true"
              className="min-h-[64px] min-[390px]:min-h-[72px] sm:min-h-[96px]"
            />
          ))}
          {calendar.days.map((day) => (
            <MoonCalendarCell key={day.date} day={day} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function MoonSummaryItem({
  label,
  day,
}: {
  readonly label: string;
  readonly day: MoonCalendarDay | undefined;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold text-card-foreground">
        {day ? day.dateLabel : "暂无"}
      </p>
      {day ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {day.phaseNameZh} / {formatPercent(day.illumination)}
        </p>
      ) : null}
    </div>
  );
}

function MoonCalendarCell({ day }: { readonly day: MoonCalendarDay }) {
  const isMajorPhase = day.isNewMoon || day.isFullMoon || day.isFirstQuarter || day.isLastQuarter;
  const compactPhaseName = compactMoonPhaseName(day.phaseNameZh);

  return (
    <div
      data-moon-calendar-day={day.date}
      className={cn(
        "min-h-[64px] min-w-0 rounded-lg border bg-card p-1 text-center shadow-sm min-[390px]:min-h-[72px] min-[390px]:p-1.5 sm:min-h-[96px] sm:p-2",
        day.isToday ? "border-primary ring-2 ring-ring" : "border-border",
        isMajorPhase && !day.isToday ? "border-accent" : "",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-bold text-card-foreground min-[390px]:text-xs">
          {day.date.slice(-2)}
        </span>
        {day.isToday ? (
          <span className="rounded-full bg-secondary px-1 py-0.5 text-[10px] font-bold text-secondary-foreground min-[390px]:px-1.5">
            <span className="min-[390px]:hidden">今</span>
            <span className="hidden min-[390px]:inline">今天</span>
          </span>
        ) : null}
      </div>
      <MoonPhaseIcon
        phaseValue={day.phaseValue}
        illumination={day.illumination}
        className="mx-auto mt-1 h-5 w-5 min-[390px]:h-6 min-[390px]:w-6 sm:h-9 sm:w-9"
      />
      <p
        className="mt-1 text-[10px] font-semibold leading-4 text-card-foreground min-[390px]:text-[11px]"
        title={day.phaseNameZh}
      >
        {compactPhaseName}
      </p>
      <p className="hidden text-[11px] leading-4 text-muted-foreground min-[520px]:block">
        {formatPercent(day.illumination)}
      </p>
      {day.lunarDateText ? (
        <p className="hidden text-[11px] leading-4 text-muted-foreground sm:block">
          农历{day.lunarDateText}
        </p>
      ) : null}
    </div>
  );
}

function compactMoonPhaseName(phaseName: MoonCalendarDay["phaseNameZh"]): string {
  return compactMoonPhaseNames[phaseName];
}

function MoonPhaseIcon({
  phaseValue,
  illumination,
  className,
}: {
  readonly phaseValue: number;
  readonly illumination: number;
  readonly className?: string;
}) {
  const normalizedPhase = normalizePhase(phaseValue);
  const darkPath =
    illumination <= 0.05
      ? fullMoonShadowPath
      : illumination >= 0.95
        ? undefined
        : buildMoonShadowPath(normalizedPhase);
  const showLight = illumination > 0.05;
  const clipId = `moon-clip-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`月亮照明 ${formatPercent(illumination)}`}
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="45" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="45" fill="#17231F" />
      {showLight ? <circle cx="50" cy="50" r="45" fill="#FFF7D6" /> : null}
      {darkPath ? (
        <path
          d={darkPath}
          fill="#17231F"
          fillRule="evenodd"
          clipPath={`url(#${clipId})`}
          clipRule="evenodd"
        />
      ) : null}
      <circle cx="50" cy="50" r="45" fill="none" stroke="#DDD4C4" strokeWidth="4" />
    </svg>
  );
}

function buildMoonShadowPath(phase: number): string | undefined {
  if (phase <= 0.035 || phase >= 0.965) {
    return fullMoonShadowPath;
  }
  if (Math.abs(phase - 0.5) <= 0.035) {
    return undefined;
  }
  if (phase < 0.25) {
    const controlX = 50 + (1 - phase / 0.25) * 42;

    return `M 5 50 A 45 45 0 1 0 95 50 A 45 45 0 1 0 5 50 M 50 5 A 45 45 0 0 1 50 95 C ${controlX} 84 ${controlX} 16 50 5`;
  }
  if (phase < 0.5) {
    const controlX = 50 - ((phase - 0.25) / 0.25) * 42;

    return `M 50 5 A 45 45 0 0 0 50 95 C ${controlX} 84 ${controlX} 16 50 5`;
  }
  if (phase < 0.75) {
    const controlX = 8 + ((phase - 0.5) / 0.25) * 42;

    return `M 50 5 A 45 45 0 0 1 50 95 C ${controlX} 84 ${controlX} 16 50 5`;
  }

  const controlX = 50 + ((phase - 0.75) / 0.25) * 42;

  return `M 5 50 A 45 45 0 1 0 95 50 A 45 45 0 1 0 5 50 M 50 5 A 45 45 0 0 0 50 95 C ${controlX} 84 ${controlX} 16 50 5`;
}

function normalizePhase(value: number): number {
  return ((value % 1) + 1) % 1;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
