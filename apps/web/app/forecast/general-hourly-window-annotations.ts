import type { ForecastCalculationResult } from "@photo-weather/shared";

export type GeneralHourlyWindowBadge = {
  readonly label: string;
  readonly detail: string;
  readonly tone?: "default" | "success" | "warning" | "danger" | "info";
};

export type GeneralHourlyRowAnnotation = GeneralHourlyWindowBadge & {
  readonly rowTime: string;
  readonly badges?: readonly GeneralHourlyWindowBadge[];
};

export type GeneralHourlyWindowInterval = {
  readonly subject: "sunrise" | "sunset" | "stars" | "milkyWay";
  readonly start: string;
  readonly end: string;
  readonly badge: GeneralHourlyWindowBadge;
};

export function buildGeneralHourlyWindowIntervals(
  result: ForecastCalculationResult,
): readonly GeneralHourlyWindowInterval[] {
  const glowIntervals = buildGlowSunPhaseAnnotationIntervals(result).map(
    (interval): GeneralHourlyWindowInterval => ({
      subject: interval.label.startsWith("朝霞") ? "sunrise" : "sunset",
      start: interval.start,
      end: interval.end,
      badge: {
        label: interval.label,
        detail: interval.detail,
        tone: interval.tone,
      },
    }),
  );
  const starIntervals = (result.astroAnalysis?.dailyAstro ?? [])
    .filter((day) => day.astronomicalNightWindow)
    .map((day): GeneralHourlyWindowInterval => {
      const window = day.astronomicalNightWindow!;
      return {
        subject: "stars",
        start: window.start,
        end: window.end,
        badge: {
          label: day.astroShootable ? "星空窗口" : "星空参考",
          detail: day.astroShootable ? day.keyReason : `${day.keyReason} ${day.riskNote}`.trim(),
          tone: day.astroShootable ? "success" : "info",
        },
      };
    });
  const recommendedMilkyWayWindows = result.astroAnalysis?.recommendedMilkyWayWindows ?? [];
  const recommendedKeys = new Set(
    recommendedMilkyWayWindows.map((window) => `${window.start}|${window.end}`),
  );
  const milkyWayIntervals = [
    ...recommendedMilkyWayWindows.map(
      (window): GeneralHourlyWindowInterval => ({
        subject: "milkyWay",
        start: window.start,
        end: window.end,
        badge: {
          label: "银河推荐",
          detail: window.noteZh,
          tone: "success",
        },
      }),
    ),
    ...(result.astroAnalysis?.milkyWayCandidateWindows ?? [])
      .filter((window) => !recommendedKeys.has(`${window.start}|${window.end}`))
      .map(
        (window): GeneralHourlyWindowInterval => ({
          subject: "milkyWay",
          start: window.start,
          end: window.end,
          badge: {
            label: "银河候选",
            detail: window.noteZh,
            tone: "info",
          },
        }),
      ),
  ];

  return [...glowIntervals, ...starIntervals, ...milkyWayIntervals].filter(
    (interval) =>
      Number.isFinite(Date.parse(interval.start)) &&
      Number.isFinite(Date.parse(interval.end)) &&
      Date.parse(interval.end) > Date.parse(interval.start),
  );
}

export function buildGeneralHourlyRowAnnotations(
  result: ForecastCalculationResult,
  rows = result.professionalHourlyData ?? [],
): readonly GeneralHourlyRowAnnotation[] {
  const intervals = buildGeneralHourlyWindowIntervals(result);
  return rows
    .map((row) => buildRowAnnotation(row.time, intervals))
    .filter((annotation): annotation is GeneralHourlyRowAnnotation => annotation !== null);
}

export function buildGlowSunPhaseAnnotationIntervals(result: ForecastCalculationResult) {
  return (result.astroSummaries ?? []).flatMap((astro) => {
    const intervals: Array<{
      readonly start: string;
      readonly end: string;
      readonly label: string;
      readonly detail: string;
      readonly tone: "default" | "success" | "warning" | "danger" | "info";
    }> = [];
    if (astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) {
      intervals.push({
        start: astro.sunriseGlowBestStartAt,
        end: astro.sunriseGlowBestEndAt,
        label: "朝霞最佳",
        detail: "由太阳高度角跨越区间推导的朝霞核心观察段。",
        tone: "success",
      });
      if (
        astro.sunriseGlowCandidateStartAt &&
        Date.parse(astro.sunriseGlowCandidateStartAt) < Date.parse(astro.sunriseGlowBestStartAt)
      ) {
        intervals.push({
          start: astro.sunriseGlowCandidateStartAt,
          end: astro.sunriseGlowBestStartAt,
          label: "朝霞候选前段",
          detail: "由太阳高度角候选区间推导的提前到位和观察准备段。",
          tone: "info",
        });
      }
      if (
        astro.sunriseGlowCandidateEndAt &&
        Date.parse(astro.sunriseGlowCandidateEndAt) > Date.parse(astro.sunriseGlowBestEndAt)
      ) {
        intervals.push({
          start: astro.sunriseGlowBestEndAt,
          end: astro.sunriseGlowCandidateEndAt,
          label: "朝霞候选后段",
          detail: "最佳窗口后的低太阳高度角候选观察段。",
          tone: "info",
        });
      }
    }
    if (astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt) {
      if (
        astro.sunsetGlowCandidateStartAt &&
        Date.parse(astro.sunsetGlowCandidateStartAt) < Date.parse(astro.sunsetGlowBestStartAt)
      ) {
        intervals.push({
          start: astro.sunsetGlowCandidateStartAt,
          end: astro.sunsetGlowBestStartAt,
          label: "晚霞候选前段",
          detail: "由太阳高度角候选区间推导的提前到位和观察准备段。",
          tone: "info",
        });
      }
      intervals.push({
        start: astro.sunsetGlowBestStartAt,
        end: astro.sunsetGlowBestEndAt,
        label: "晚霞最佳",
        detail: "由太阳高度角跨越区间推导的晚霞核心观察段。",
        tone: "success",
      });
      if (
        astro.sunsetGlowCandidateEndAt &&
        Date.parse(astro.sunsetGlowCandidateEndAt) > Date.parse(astro.sunsetGlowBestEndAt)
      ) {
        intervals.push({
          start: astro.sunsetGlowBestEndAt,
          end: astro.sunsetGlowCandidateEndAt,
          label: "晚霞候选后段",
          detail: "最佳窗口后的低太阳高度角候选观察段。",
          tone: "info",
        });
      }
    }
    return intervals;
  });
}

function buildRowAnnotation(
  rowTime: string,
  intervals: readonly GeneralHourlyWindowInterval[],
): GeneralHourlyRowAnnotation | null {
  const matchingIntervals = intervals
    .filter((interval) => hourOverlapsWindow(rowTime, interval.start, interval.end))
    .sort((left, right) => subjectPriority(right.subject) - subjectPriority(left.subject));
  const badges = matchingIntervals.reduce<GeneralHourlyWindowBadge[]>((items, interval) => {
    if (!items.some((item) => item.label === interval.badge.label)) {
      items.push(interval.badge);
    }
    return items;
  }, []);
  const primary = badges[0];
  return primary ? { rowTime, ...primary, badges } : null;
}

function subjectPriority(subject: GeneralHourlyWindowInterval["subject"]): number {
  if (subject === "milkyWay") {
    return 4;
  }
  if (subject === "stars") {
    return 3;
  }
  if (subject === "sunset") {
    return 2;
  }
  return 1;
}

function hourOverlapsWindow(time: string, start: string, end: string): boolean {
  const timeMs = Date.parse(time);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const hourEndMs = timeMs + 60 * 60 * 1000;
  return (
    Number.isFinite(timeMs) &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    hourEndMs > startMs &&
    timeMs < endMs
  );
}
