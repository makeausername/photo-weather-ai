import { describe, expect, it } from "vitest";

import {
  clothingEquipmentAdvice,
  compactPrecipitationDisplayText,
  isProbabilityOnlyPrecipitationSignal,
  joinChineseSentences,
  rainRiskText,
} from "./forecast-copy";

function precipitationRisk(overrides: Partial<{
  precipitationProbabilityPercent: number | null;
  precipitationAmountMm: number | null;
  rainRiskLevel: "none" | "low" | "medium" | "high" | "severe";
  rainRiskLabelZh: string;
  affectedWindows: readonly string[];
  recommendationZh: string;
}> = {}) {
  return {
    precipitationProbabilityPercent: 74,
    precipitationAmountMm: 0,
    rainRiskLevel: "high" as const,
    rainRiskLabelZh: "高",
    affectedWindows: [],
    recommendationZh: "降水干扰需优先规避。",
    ...overrides,
  };
}

describe("forecast precipitation copy", () => {
  it("uses natural low-risk wording and joins sentences without duplicate punctuation", () => {
    const copy = rainRiskText({
      precipitationProbabilityPercent: 0,
      precipitationAmountMm: 0,
    });

    expect(copy.detail).toContain("降水风险较低");
    expect(copy.detail).not.toContain("降水风险无明显");
    expect(joinChineseSentences(copy.detail, "风雨对拍摄干扰相对可控。")).not.toContain("。。");
  });

  it("normalizes punctuation inside equipment lists", () => {
    const advice = clothingEquipmentAdvice({
      titleZh: "轻量分层",
      summaryZh: "按体感增减衣物。",
      layers: ["速干长袖"],
      accessories: ["防风帽或头巾。"],
      riskNotes: ["三脚架和人员站位需要留余量。"],
      comfortLevel: "comfortable",
    });

    expect(advice[1]).toBe("装备重点：防风帽或头巾、三脚架和人员站位需要留余量。");
    expect(advice[1]).not.toContain("。。");
  });

  it("treats 45% probability with 0 mm as an inconsistent signal, not confirmed rain", () => {
    const weather = {
      precipitationProbabilityPercent: 45,
      precipitationAmountMm: 0,
    };

    const copy = rainRiskText(weather);
    const combined = [copy.value, copy.detail, copy.timing].join(" ");

    expect(copy.level).toBe("待复核");
    expect(combined).toContain("降水概率信号");
    expect(combined).toContain("预计雨量 0 mm");
    expect(combined).toContain("需复核");
    expect(combined).not.toContain("有降水干扰");
    expect(combined).not.toContain("降水干扰需优先规避");
    expect(combined).not.toContain("降水风险中");
    expect(combined).not.toContain("降水风险高");
    expect(compactPrecipitationDisplayText(weather)).toBe("降水概率信号：45%，雨量 0mm");
    expect(isProbabilityOnlyPrecipitationSignal(weather)).toBe(true);
  });

  it("keeps contradictory risk payloads data-grounded when primary rain amount is 0 mm", () => {
    const weather = {
      precipitationProbabilityPercent: 45,
      precipitationAmountMm: 0,
      precipitationRisk: precipitationRisk({
        precipitationProbabilityPercent: 45,
        precipitationAmountMm: 1,
        rainRiskLevel: "medium",
        rainRiskLabelZh: "中",
        affectedWindows: ["清晨", "傍晚", "夜间"],
        recommendationZh:
          "降雨风险中，降雨 1 mm，雾，有降水干扰，预计 0 mm，可能影响清晨、傍晚、夜间。降水干扰需优先规避。",
      }),
    };

    const copy = rainRiskText(weather);
    const combined = [copy.value, copy.detail, copy.timing].join(" ");

    expect(copy.level).toBe("待复核");
    expect(combined).toContain("降水概率信号");
    expect(combined).toContain("预计雨量 0 mm");
    expect(combined).toContain("雨量证据不一致");
    expect(combined).toContain("可能受降水概率信号影响的时段：清晨、傍晚、夜间，需复核");
    expect(combined).not.toContain("有降水干扰");
    expect(combined).not.toContain("降水干扰需优先规避");
    expect(combined).not.toContain("降水风险中");
    expect(combined).not.toContain("降雨 1 mm");
    expect(compactPrecipitationDisplayText(weather)).toBe("降水概率信号：45%，雨量 0mm");
    expect(isProbabilityOnlyPrecipitationSignal(weather)).toBe(true);
  });

  it("does not treat affected windows alone as confirmed precipitation proof", () => {
    const weather = {
      precipitationProbabilityPercent: 45,
      precipitationAmountMm: 0,
      precipitationRisk: precipitationRisk({
        precipitationProbabilityPercent: 45,
        precipitationAmountMm: 0,
        rainRiskLevel: "medium",
        rainRiskLabelZh: "中",
        affectedWindows: ["清晨"],
        recommendationZh: "有降水干扰，可能影响清晨。降水干扰需优先规避。",
      }),
    };

    const copy = rainRiskText(weather);
    const combined = [copy.value, copy.detail, copy.timing].join(" ");

    expect(copy.level).toBe("待复核");
    expect(combined).toContain("预计雨量 0 mm");
    expect(combined).toContain("可能受降水概率信号影响的时段：清晨，需复核");
    expect(combined).not.toContain("有降水干扰");
    expect(combined).not.toContain("降水干扰需优先规避");
    expect(combined).not.toContain("降水风险中");
    expect(isProbabilityOnlyPrecipitationSignal(weather)).toBe(true);
  });

  it("keeps rain risk wording when probability has meaningful precipitation amount support", () => {
    const weather = {
      precipitationProbabilityPercent: 45,
      precipitationAmountMm: 1.2,
    };

    const copy = rainRiskText(weather);

    expect(copy.level).toBe("中");
    expect(copy.detail).toContain("降水风险中");
    expect(copy.detail).toContain("预计 1.2 mm");
    expect(copy.detail).not.toContain("降水概率信号");
    expect(compactPrecipitationDisplayText(weather)).toBe("降水风险：中，概率 45%，预计 1.2mm");
    expect(isProbabilityOnlyPrecipitationSignal(weather)).toBe(false);
  });

  it("allows rainy weather text with missing amount while naming the missing amount", () => {
    const weather = {
      weatherTextZh: "小雨",
      precipitationProbabilityPercent: null,
      precipitationAmountMm: null,
    };

    const copy = rainRiskText(weather);

    expect(copy.value).toContain("降雨信号");
    expect(copy.detail).toContain("预计雨量暂缺");
    expect(copy.timing).toContain("预计雨量暂缺");
    expect(compactPrecipitationDisplayText(weather)).toBe("降雨信号，雨量待复核");
  });

  it("uses neutral missing-data copy when probability and amount are both unavailable", () => {
    const weather = {};

    const copy = rainRiskText(weather);

    expect(copy.level).toBe("待复核");
    expect(copy.detail).toContain("降水概率暂缺");
    expect(compactPrecipitationDisplayText(weather)).toBe("降水证据不足");
    expect(isProbabilityOnlyPrecipitationSignal(weather)).toBe(false);
  });
});
