import { describe, expect, it } from "vitest";
import {
  filterRowsToForecastWindow,
  resolveForecastWindowRange,
} from "../forecast-window-anchor.js";

type HourRow = {
  readonly time: string;
};

describe("forecast window anchor", () => {
  it("starts future24 from the next forecast hour for an 08:28 generation time", () => {
    const range = resolveForecastWindowRange({
      generatedAt: "2026-06-02T08:28:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "24h",
    });
    const rows = hourlyRows("2026-06-02T00:00:00+08:00", 36);
    const filtered = filterRowsToForecastWindow(rows, range, (row) => row.time);

    expect(range).toMatchObject({
      generatedAtLocal: "2026-06-02T08:28:00+08:00",
      anchorStartLocal: "2026-06-02T09:00:00+08:00",
      anchorEndLocal: "2026-06-03T08:00:00+08:00",
      requestedHours: 24,
      isFutureOnly: true,
      anchorRule: "future_hour_ceil_to_next_hour",
    });
    expect(filtered).toHaveLength(24);
    expect(filtered[0]?.time).toBe("2026-06-02T09:00:00+08:00");
    expect(filtered.at(-1)?.time).toBe("2026-06-03T08:00:00+08:00");
    expect(filtered.some((row) => row.time < "2026-06-02T09:00:00+08:00")).toBe(false);
  });

  it("rolls a late-night generated forecast to next-day midnight", () => {
    const range = resolveForecastWindowRange({
      generatedAt: "2026-06-02T23:20:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "24h",
    });

    expect(range.anchorStartLocal).toBe("2026-06-03T00:00:00+08:00");
    expect(range.anchorEndLocal).toBe("2026-06-03T23:00:00+08:00");
  });

  it("keeps the current full hour but never includes earlier same-day rows", () => {
    const range = resolveForecastWindowRange({
      generatedAt: "2026-06-02T08:00:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "24h",
    });
    const rows = hourlyRows("2026-06-02T00:00:00+08:00", 36);
    const filtered = filterRowsToForecastWindow(rows, range, (row) => row.time);

    expect(range.anchorStartLocal).toBe("2026-06-02T08:00:00+08:00");
    expect(filtered[0]?.time).toBe("2026-06-02T08:00:00+08:00");
    expect(filtered.some((row) => row.time < "2026-06-02T08:00:00+08:00")).toBe(false);
  });

  it("normalizes provider UTC rows before filtering", () => {
    const range = resolveForecastWindowRange({
      generatedAt: "2026-06-02T08:28:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "24h",
    });
    const rows = hourlyRows("2026-06-01T16:00:00Z", 40);
    const filtered = filterRowsToForecastWindow(rows, range, (row) => row.time);

    expect(filtered).toHaveLength(24);
    expect(filtered[0]?.time).toBe("2026-06-02T01:00:00.000Z");
    expect(filtered.at(-1)?.time).toBe("2026-06-03T00:00:00.000Z");
  });

  it("clips future48 and future72 to the requested future-hour counts", () => {
    const rows = hourlyRows("2026-06-02T00:00:00+08:00", 96);
    const future48 = filterRowsToForecastWindow(
      rows,
      resolveForecastWindowRange({
        generatedAt: "2026-06-02T08:28:00+08:00",
        timezone: "Asia/Shanghai",
        horizon: "48h",
      }),
      (row) => row.time,
    );
    const future72 = filterRowsToForecastWindow(
      rows,
      resolveForecastWindowRange({
        generatedAt: "2026-06-02T08:28:00+08:00",
        timezone: "Asia/Shanghai",
        horizon: "72h",
      }),
      (row) => row.time,
    );

    expect(future48).toHaveLength(48);
    expect(future48[0]?.time).toBe("2026-06-02T09:00:00+08:00");
    expect(future72).toHaveLength(72);
    expect(future72[0]?.time).toBe("2026-06-02T09:00:00+08:00");
  });
});

function hourlyRows(start: string, count: number): readonly HourRow[] {
  const startMs = Date.parse(start);
  const hasOffset = /[+-]\d{2}:\d{2}$/.test(start);
  return Array.from({ length: count }, (_, index) => ({
    time: hasOffset
      ? formatOffsetHour(start, index)
      : new Date(startMs + index * 60 * 60 * 1000).toISOString(),
  }));
}

function formatOffsetHour(start: string, index: number): string {
  const offsetMatch = /([+-]\d{2}:\d{2})$/.exec(start);
  if (!offsetMatch) {
    return new Date(Date.parse(start) + index * 60 * 60 * 1000).toISOString();
  }

  const offset = offsetMatch[1]!;
  const date = new Date(Date.parse(start) + index * 60 * 60 * 1000);
  const offsetMinutes = offsetToMinutes(offset);
  const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(
    local.getUTCDate(),
  )}T${pad2(local.getUTCHours())}:00:00${offset}`;
}

function offsetToMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return sign * ((hours ?? 0) * 60 + (minutes ?? 0));
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
