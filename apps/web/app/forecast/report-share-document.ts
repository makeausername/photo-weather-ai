import {
  forecastHorizonLabels,
  formatLocalDateTime,
  type ForecastCalculationResult,
} from "@photo-weather/shared";
import type { buildPhotographyOutlook } from "./photography-outlook";
import type { SubjectDecisionReport } from "./subject-decision-report";

export type ShareSection = { title: string; lines: readonly string[] };
export type ShareDocument = {
  location: string;
  topic: string;
  updated: string;
  sections: ShareSection[];
};

export function buildShareDocument(
  result: ForecastCalculationResult,
  content: ReturnType<typeof buildPhotographyOutlook> | SubjectDecisionReport,
): ShareDocument {
  const subject = "verdict" in content;
  const timezone = result.calendarBasis?.timezone || "Asia/Shanghai";
  const date = new Date(result.generatedAt);
  const updated = Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)} · ${timezone}`
    : "报告时间待确认";
  const sections: ShareSection[] = [
    {
      title: "出行结论",
      lines: subject
        ? [
            content.verdict,
            content.reason,
            `什么时候拍：${content.timing}`,
            `到场安排：${content.arrival}`,
            ...(content.caution ? [content.caution] : []),
            ...content.risks.lines.slice(0, 1).map((line) => `主要风险：${line}`),
          ]
        : [...content.conclusion, ...content.risks.slice(0, 1).map((line) => `主要风险：${line}`)],
    },
  ];
  const alerts = result.weatherAlerts ?? [];
  if (alerts.length) {
    // Keep warning titles ahead of the opportunity cards, even when the cover overflows.
    sections.unshift({ title: "天气预警", lines: alerts.map((alert) => alert.title) });
  } else if (result.weatherAlertsStatus !== "available") {
    sections.push({
      title: "预警资料",
      lines: ["天气预警暂未获取，请在出发前查看当地气象部门的最新预警。"],
    });
  }
  sections.push(
    ...(subject
      ? content.dates.map((day) => ({
          title: day.title,
          lines: [...(day.summary ? [day.summary] : []), ...day.lines],
        }))
      : content.days.map((day) => ({
          title: day.label,
          lines: [day.recommendation, ...day.lines],
        }))),
  );
  sections.push(
    ...(subject
      ? [content.shooting, content.risks]
      : [
          { title: "拍摄建议", lines: content.shooting },
          { title: "主要风险", lines: content.risks },
          { title: "穿衣与装备", lines: content.clothing },
        ]),
  );
  for (const alert of alerts) {
    sections.push({
      title: alert.title,
      lines: [
        alert.description,
        ...(alert.instruction ? [alert.instruction] : []),
        ...(alert.senderName ? [`发布部门：${alert.senderName}`] : []),
        `生效：${formatLocalDateTime(alert.startsAt, timezone)}${alert.endsAt ? `；到期：${formatLocalDateTime(alert.endsAt, timezone)}` : ""}`,
        ...(alert.attributions ?? []),
      ],
    });
  }
  return {
    location: result.place?.name || "所选机位",
    topic: `${subject ? content.title : "天气概览"} · ${forecastHorizonLabels[result.horizon]}`,
    updated,
    sections,
  };
}

export function shareFileStem(document: ShareDocument): string {
  return (
    `逐光天气-${document.location}-${document.topic}`
      // File names must strip ASCII control characters as well as reserved punctuation.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .slice(0, 90)
  );
}
