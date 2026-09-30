import { toText } from "./normalization.js";
import type { WeatherAlert } from "./types.js";

// https://dev.qweather.com/en/docs/api/warning/weather-alert/
export function normalizeQWeatherAlerts(body: Record<string, unknown>): readonly WeatherAlert[] {
  const metadata = body.metadata as { zeroResult?: boolean; attributions?: unknown } | undefined;
  if (!Array.isArray(body.alerts)) {
    if (metadata?.zeroResult === true) return [];
    throw new Error("QWeather alert response is missing alerts.");
  }
  const records = body.alerts as Record<string, unknown>[];
  const superseded = new Set(
    records.flatMap((record) => {
      const message = record.messageType as { supersedes?: unknown } | undefined;
      return Array.isArray(message?.supersedes)
        ? message.supersedes.filter((id): id is string => typeof id === "string")
        : [];
    }),
  );
  const attributions = Array.isArray(metadata?.attributions)
    ? metadata.attributions.filter((value): value is string => typeof value === "string")
    : [];
  return records.flatMap((record) => {
    const message = record.messageType as { code?: string } | undefined;
    const id = toText(record.id);
    if (message?.code === "cancel" || record.urgency === "past" || (id && superseded.has(id)))
      return [];
    const title = toText(record.headline);
    const description = toText(record.description);
    const startsAt = toText(record.effectiveTime);
    const endsAt = toText(record.expireTime);
    if (
      !id ||
      !title ||
      !description ||
      !startsAt ||
      !endsAt ||
      !Number.isFinite(Date.parse(startsAt)) ||
      !Number.isFinite(Date.parse(endsAt))
    ) {
      throw new Error("QWeather alert response contains invalid required fields.");
    }
    const color = (record.color as { code?: string } | undefined)?.code;
    const severityLevel =
      record.severity === "extreme"
        ? "red"
        : record.severity === "severe"
          ? "orange"
          : record.severity === "moderate"
            ? "yellow"
            : record.severity === "minor"
              ? "blue"
              : "unknown";
    const level: WeatherAlert["level"] =
      color === "red" || color === "orange" || color === "yellow" || color === "blue"
        ? color
        : severityLevel;
    return [
      {
        id,
        title,
        description,
        startsAt,
        endsAt,
        level,
        senderName: toText(record.senderName) ?? undefined,
        instruction: toText(record.instruction) ?? undefined,
        attributions,
      },
    ];
  });
}
