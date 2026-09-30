import React from "react";
import { formatLocalDateTime, type ForecastCalculationResult } from "@photo-weather/shared";
import { Badge, Card } from "../../components/ui";

const colorLabels = {
  blue: "蓝色",
  yellow: "黄色",
  orange: "橙色",
  red: "红色",
  unknown: "等级未明确",
};

export function WeatherAlerts({ result }: { readonly result: ForecastCalculationResult }) {
  const alerts = result.weatherAlerts ?? [];
  if (alerts.length === 0) {
    if (result.weatherAlertsStatus === "available") return null;
    return (
      <Card className="p-4 text-sm text-muted-foreground" data-weather-alert-status="unavailable">
        天气预警暂未获取，请在出发前查看当地气象部门的最新预警。
      </Card>
    );
  }
  const attributions = [...new Set(alerts.flatMap((alert) => alert.attributions ?? []))];
  return (
    <Card className="grid min-w-0 gap-4 border-warning p-5" data-weather-alert-status="available">
      <h2 className="font-bold text-card-foreground">天气预警</h2>
      {alerts.map((alert) => (
        <article key={alert.id} className="grid min-w-0 gap-2 break-words">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{colorLabels[alert.level]}</Badge>
            <h3 className="font-semibold">{alert.title}</h3>
          </div>
          <p className="text-sm leading-6">{alert.description}</p>
          {alert.instruction ? <p className="text-sm leading-6">{alert.instruction}</p> : null}
          {alert.senderName ? (
            <p className="text-xs text-muted-foreground">发布部门：{alert.senderName}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            生效：{formatLocalDateTime(alert.startsAt, result.calendarBasis.timezone)}
            {alert.endsAt
              ? `；到期：${formatLocalDateTime(alert.endsAt, result.calendarBasis.timezone)}`
              : ""}
          </p>
        </article>
      ))}
      {attributions.length > 0 ? (
        <div className="grid gap-1 break-words text-xs text-muted-foreground">
          {attributions.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
