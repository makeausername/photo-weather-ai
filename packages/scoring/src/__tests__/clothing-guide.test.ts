import { describe, expect, it } from "vitest";
import { buildClothingGuide } from "../index.js";
import type {
  NormalizedHourlyWeather,
  NormalizedCurrentWeather,
  ForecastMultiSourceAgreementContext,
} from "@photo-weather/shared";

describe("buildClothingGuide", () => {
  it("labels current rain as an observation and warns about uncertain temperatures", () => {
    const guide = buildClothingGuide({
      currentWeather: {
        ...hour({ precipitation: 0.3, precipitationAmountMm: 0.3, precipitationProbability: null }),
        dataKind: "observation",
        observedAt: "2026-05-20T06:00:00+08:00",
      } as NormalizedCurrentWeather,
      hourlyWeather: [hour({ precipitation: 0 })],
      target: "general",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T06:00:00+08:00",
      multiSourceAgreementContext: {
        agreementLevel: "low",
        disagreementLevel: "high",
        shouldLowerConfidence: true,
        shouldShowReviewWarning: true,
        keyWarningsZh: [],
        userSummaryZh: "气温需复核",
        professionalSummaryZh: "气温需复核",
        fieldDisagreements: [
          {
            field: "temperature",
            level: "high",
            range: 11.1,
            sourcesAvailable: 2,
            messageZh: "气温需复核",
          },
        ],
      } satisfies ForecastMultiSourceAgreementContext,
    });
    expect(guide.summaryZh).toContain("观测小时降水 0.3 mm");
    expect(guide.summaryZh).not.toContain("预计降水 0.3");
    expect(guide.summaryZh).toContain("可信度降低");
    expect(guide.riskNotes.join(" ")).toContain("11.1°C");
    expect(guide.riskNotes.join(" ")).toContain("备用保暖层");
  });
  it("keeps low probability and missing rain data distinct from actual rain", () => {
    const input = {
      elevationMeters: 0,
      target: "general" as const,
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T06:00:00+08:00",
    };
    const low = buildClothingGuide({
      ...input,
      hourlyWeather: [hour({ precipitationProbability: 22, precipitation: 0, humidity: 61 })],
    });
    expect(low.riskNotes.join("")).toContain("弱降水概率信号");
    expect(low.riskNotes.join("")).not.toContain("存在降水干扰");
    expect(low.accessories).not.toContain("备用干衣");
    const unknown = buildClothingGuide({
      ...input,
      hourlyWeather: [hour({ precipitationProbability: null, precipitation: null, humidity: 61 })],
    });
    expect(unknown.riskNotes.join("")).toContain("降水数据不足");
    expect(unknown.accessories).not.toContain("防水外套");
  });
  it("recommends warm layers for mountain astro nights", () => {
    const guide = buildClothingGuide({
      hourlyWeather: [
        hour({
          time: "2026-05-20T22:00:00+08:00",
          temperature: 6,
          feelsLike: 3,
          windSpeed: 4.8,
        }),
      ],
      elevationMeters: 1800,
      target: "astro",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T20:00:00+08:00",
    });

    expect(guide.comfortLevel).toBe("very_cold");
    expect(guide.layers.join("、")).toContain("羽绒服");
    expect(guide.accessories).toEqual(expect.arrayContaining(["帽子", "手套"]));
    expect(guide.riskNotes.join("")).toContain("夜间长时间等待");
  });

  it("adds waterproof and anti-slip advice for rainy cloud sea trips", () => {
    const guide = buildClothingGuide({
      hourlyWeather: [
        hour({
          precipitationProbability: 68,
          humidity: 93,
          windSpeed: 3,
        }),
      ],
      elevationMeters: 1600,
      target: "cloud_sea",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T05:00:00+08:00",
    });

    expect(guide.comfortLevel).toBe("rainy");
    expect(guide.accessories).toEqual(expect.arrayContaining(["防水外套", "防滑鞋", "镜头布"]));
    expect(guide.riskNotes.join("")).toContain("防潮");
  });

  it("uses precipitation amount when probability is unavailable", () => {
    const guide = buildClothingGuide({
      hourlyWeather: [
        hour({
          precipitationProbability: null,
          precipitation: 8,
          precipitationAmountMm: 8,
          rainAmountMm: 8,
          humidity: 92,
          windSpeed: 4,
        }),
      ],
      elevationMeters: 1700,
      target: "general",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T06:00:00+08:00",
    });

    expect(guide.comfortLevel).toBe("rainy");
    expect(guide.summaryZh).toContain("预计降水 8 mm");
    expect(guide.summaryZh).not.toContain("0%");
    expect(guide.accessories).toEqual(expect.arrayContaining(["防水外套", "防滑鞋", "备用干衣"]));
  });
});

function hour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-20T06:00:00+08:00",
    temperature: 12,
    feelsLike: 10,
    humidity: 82,
    dewPointSpread: 3,
    pressure: 1004,
    windSpeed: 3,
    windGust: 5,
    windDirection: 120,
    precipitationProbability: 12,
    precipitation: 0,
    visibility: 18,
    dewPoint: 9,
    cloudTotal: 55,
    cloudLow: 35,
    cloudMid: 42,
    cloudHigh: 28,
    weatherCode: "3",
    providerCode: "mock",
    sourceConfidence: 0.8,
    ...overrides,
  };
}
