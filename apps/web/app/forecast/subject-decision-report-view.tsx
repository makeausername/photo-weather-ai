import React from "react";
import {
  forecastHorizonLabels,
  type ForecastCalculationResult,
  type ForecastQueryInput,
} from "@photo-weather/shared";
import { Card } from "../../components/ui";
import type { SubjectDecisionReport, SubjectReportSection } from "./subject-decision-report";
import { ReportLocationMeta } from "./report-location-meta";
import { ReportShareButton } from "./report-share-button";
import { buildShareDocument } from "./report-share-document";

export function SubjectDecisionReportView({
  query,
  result,
  report,
  returnUrl,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly report: SubjectDecisionReport;
  readonly returnUrl?: string;
}) {
  const path = report.target === "cloud_sea" ? "/cloud-sea" : `/${report.target}`;
  return (
    <main
      className="mx-auto grid w-full min-w-0 max-w-4xl gap-4 [overflow-wrap:anywhere]"
      data-subject-decision-report={report.target}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {query.name} · {report.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {forecastHorizonLabels[result.horizon]}
          </p>
          <ReportLocationMeta result={result} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportShareButton document={buildShareDocument(result, report)} />
          <a
            href={returnUrl ?? path}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-primary"
          >
            {returnUrl ? "返回天气概览" : "更换地点与范围"}
          </a>
        </div>
      </header>
      <Card className="grid min-w-0 gap-3 p-5 sm:p-6" data-subject-report-section="decision">
        <h2 className="text-sm font-semibold text-muted-foreground">这趟值不值得去</h2>
        <p className="text-xl font-bold leading-8" data-subject-report-verdict>
          {report.verdict}
        </p>
        <p className="text-sm leading-7">{report.reason}</p>
        <div className="grid gap-2 border-t border-border pt-3 text-sm leading-7">
          <p>
            <span className="font-semibold">什么时候拍：</span>
            {report.timing}
          </p>
          <p>
            <span className="font-semibold">到场安排：</span>
            {report.arrival}
          </p>
        </div>
        {report.caution ? (
          <p className="text-sm leading-6 text-warning-strong">{report.caution}</p>
        ) : null}
        {report.risks.lines[0] ? (
          <p className="text-sm leading-6">
            <span className="font-semibold">主要风险：</span>
            {report.risks.lines[0]}
          </p>
        ) : null}
      </Card>
      <Card className="min-w-0 p-5 sm:p-6" data-subject-report-section="dates">
        <h2 className="text-base font-semibold">{report.datesTitle}</h2>
        <div className="mt-4 divide-y divide-border">
          {report.dates.length ? (
            report.dates.map((day, index) => (
              <details
                key={`${day.title}-${index}`}
                open={
                  report.dates.length <= 2 ||
                  (day.date && report.selectedDate ? day.date === report.selectedDate : index === 0)
                }
                className="grid gap-2 py-4 first:pt-0 last:pb-0"
              >
                <summary className="cursor-pointer text-sm leading-7">
                  <span className="font-semibold">{day.title}</span>
                  <span className="ml-2">{day.summary || day.lines[0]}</span>
                </summary>
                <div className="mt-2">
                  <ReportLines lines={day.lines} />
                </div>
              </details>
            ))
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">
              暂无可确认的拍摄时段，等资料更新后再决定。
            </p>
          )}
        </div>
      </Card>
      <ReportSection section={report.shooting} name="shooting" />
      <ReportSection section={report.risks} name="risks" />
    </main>
  );
}

function ReportSection({
  section,
  name,
}: {
  readonly section: SubjectReportSection;
  readonly name: string;
}) {
  return (
    <Card className="grid min-w-0 gap-3 p-5 sm:p-6" data-subject-report-section={name}>
      <h2 className="text-base font-semibold">{section.title}</h2>
      <ReportLines lines={section.lines} />
    </Card>
  );
}

function ReportLines({ lines }: { readonly lines: readonly string[] }) {
  return (
    <div className="grid gap-2 text-sm leading-7">
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
}
