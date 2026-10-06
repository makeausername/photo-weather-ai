import React from "react";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import { Card } from "../../components/ui";
import { buildPhotographyOutlook } from "./photography-outlook";

export function PhotographyOutlook({ result }: { readonly result: ForecastCalculationResult }) {
  const outlook = buildPhotographyOutlook(result);
  const paragraphs = (lines: readonly string[]) => lines.map((line, i) => <p key={i}>{line}</p>);
  return (
    <div
      className="mx-auto grid w-full min-w-0 max-w-4xl gap-4 [overflow-wrap:anywhere]"
      data-photography-outlook="true"
    >
      <Card className="decision-hero min-w-0 p-5 sm:p-6">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground">出行结论</h2>
        <div
          className="mt-4 grid gap-2 text-sm leading-7 text-card-foreground [&>p:first-child]:text-lg [&>p:first-child]:font-semibold"
          data-outlook-section="conclusion"
        >
          {paragraphs(outlook.conclusion)}
        </div>
      </Card>
      <Card className="min-w-0 p-5 sm:p-6">
        <h2 className="text-base font-semibold">拍摄时段</h2>
        <div className="mt-4 divide-y divide-border">
          {outlook.days.length ? (
            outlook.days.map((day) => (
              <article
                key={day.date}
                className="py-5 first:pt-0 last:pb-0"
                data-outlook-day={day.date}
              >
                <h3 className="mb-3 text-base font-semibold text-primary">{day.label}</h3>
                <div className="grid gap-2 text-sm leading-7 text-card-foreground">
                  {paragraphs(day.lines)}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">
              日期与天气资料待确认，暂时无法逐日判断。
            </p>
          )}
        </div>
      </Card>
      {(
        [
          ["shooting", "拍摄建议", outlook.shooting],
          ["risks", "主要风险", outlook.risks],
        ] as const
      ).map(([key, title, lines]) => (
        <Card key={key} className="min-w-0 p-5 sm:p-6" data-outlook-section={key}>
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="mt-3 grid gap-2 text-sm leading-7 text-card-foreground">
            {paragraphs(lines)}
          </div>
        </Card>
      ))}
      <details className="border-t border-border pt-3" data-outlook-section="clothing">
        <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
          穿衣与装备建议
        </summary>
        <div className="grid gap-2 py-3 text-sm leading-7 text-muted-foreground">
          {paragraphs(outlook.clothing)}
        </div>
      </details>
    </div>
  );
}
