import React from "react";
import type { ForecastCalculationResult } from "@photo-weather/shared";

export function ReportLocationMeta({ result }: { readonly result: ForecastCalculationResult }) {
  const elevation = result.terrainAnalysis?.terrainProfile.elevationMeters;
  const updated = new Date(result.generatedAt);
  const timezone = result.calendarBasis?.timezone || "Asia/Shanghai";
  const time = Number.isFinite(updated.getTime())
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(updated)
    : "待确认";
  return (
    <div className="text-xs leading-6 text-muted-foreground" data-report-location>
      <p>
        {typeof elevation === "number" && Number.isFinite(elevation)
          ? `机位海拔约 ${Math.round(elevation)} 米`
          : "机位海拔待确认"}{" "}
        · 报告更新 {time}（{timezone === "Asia/Shanghai" ? "北京时间" : timezone}）
      </p>
      <details>
        <summary className="cursor-pointer">核对机位位置</summary>
        <p>
          {result.place?.name} ·{" "}
          {[result.place?.adminArea, result.place?.locality].filter(Boolean).join(" ")}
        </p>
        {result.place?.coordinates ? (
          <p>
            纬度 {result.place.coordinates.latitude.toFixed(5)}，经度{" "}
            {result.place.coordinates.longitude.toFixed(5)}（
            {result.place.coordinates.system.toUpperCase()}）
          </p>
        ) : (
          <p>具体位置待确认</p>
        )}
      </details>
    </div>
  );
}
