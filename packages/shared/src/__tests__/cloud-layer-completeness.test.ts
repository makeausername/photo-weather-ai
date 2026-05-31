import { describe, expect, it } from "vitest";
import {
  buildCloudLayerCompletenessContext,
  type CloudLayerCompletenessHourlyRow,
} from "../cloud-layer-completeness.js";

describe("cloud layer completeness context", () => {
  it("marks fully explicit layer rows as complete", () => {
    const context = buildCloudLayerCompletenessContext([
      layerRow({ cloudHighPercent: 25, cloudMidPercent: 38, cloudLowPercent: 45 }),
      layerRow({ cloudHighPercent: 30, cloudMidPercent: 42, cloudLowPercent: 58 }),
    ]);

    expect(context.cloudLayerBasis).toBe("explicit_layers");
    expect(context.layerCompletenessLevel).toBe("complete");
    expect(context.cautionLevel).toBe("none");
    expect(context.completeLayerHoursCount).toBe(2);
    expect(context.shouldReduceCloudSeaConfidence).toBe(false);
    expect(context.shouldPreferNeedsReviewSignal).toBe(false);
  });

  it("marks a few missing layer fields as partial", () => {
    const context = buildCloudLayerCompletenessContext([
      layerRow({ cloudHighPercent: 25, cloudMidPercent: 38, cloudLowPercent: 45 }),
      layerRow({
        cloudHighPercent: 30,
        cloudMidPercent: 42,
        cloudLowPercent: null,
        cloudLayerBasis: "partial_layers",
        missingFields: ["cloudLow"],
      }),
      layerRow({ cloudHighPercent: 32, cloudMidPercent: 44, cloudLowPercent: 50 }),
    ]);

    expect(context.cloudLayerBasis).toBe("partial_layers");
    expect(context.layerCompletenessLevel).toBe("partial");
    expect(context.missingLayerFields).toEqual(["low"]);
    expect(context.lowLayerMissingHoursCount).toBe(1);
    expect(context.shouldReduceCloudSeaConfidence).toBe(true);
    expect(context.shouldPreferNeedsReviewSignal).toBe(true);
  });

  it("marks many missing layer fields as weak", () => {
    const context = buildCloudLayerCompletenessContext([
      layerRow({ cloudHighPercent: 25, cloudMidPercent: 38, cloudLowPercent: 45 }),
      layerRow({
        cloudHighPercent: 30,
        cloudMidPercent: null,
        cloudLowPercent: null,
        cloudLayerBasis: "partial_layers",
        missingFields: ["cloudMid", "cloudLow"],
      }),
      layerRow({
        cloudHighPercent: null,
        cloudMidPercent: 44,
        cloudLowPercent: null,
        cloudLayerBasis: "partial_layers",
        missingFields: ["cloudHigh", "cloudLow"],
      }),
    ]);

    expect(context.cloudLayerBasis).toBe("partial_layers");
    expect(context.layerCompletenessLevel).toBe("weak");
    expect(context.cautionLevel).toBe("medium");
    expect(context.missingLayerHoursCount).toBe(2);
    expect(context.lowLayerMissingHoursCount).toBe(2);
  });

  it("marks total-cloud-only rows as missing layer structure", () => {
    const context = buildCloudLayerCompletenessContext([
      layerRow({
        cloudTotalPercent: 92,
        cloudHighPercent: null,
        cloudMidPercent: null,
        cloudLowPercent: null,
        cloudLayerBasis: "total_only",
        missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
      }),
    ]);

    expect(context.cloudLayerBasis).toBe("total_only");
    expect(context.layerCompletenessLevel).toBe("missing");
    expect(context.cautionLevel).toBe("high");
    expect(context.missingLayerFields).toEqual(["high", "mid", "low"]);
    expect(context.professionalNoteZh).toContain("不使用总云量回填");
  });

  it("prefers review signals when low cloud is missing", () => {
    const context = buildCloudLayerCompletenessContext([
      layerRow({
        cloudHighPercent: 25,
        cloudMidPercent: 38,
        cloudLowPercent: null,
        cloudLayerBasis: "partial_layers",
        missingFields: ["cloudLow"],
      }),
    ]);

    expect(context.shouldPreferNeedsReviewSignal).toBe(true);
  });
});

function layerRow(
  overrides: Partial<CloudLayerCompletenessHourlyRow> = {},
): CloudLayerCompletenessHourlyRow {
  return {
    cloudTotalPercent: 88,
    cloudHighPercent: 28,
    cloudMidPercent: 42,
    cloudLowPercent: 55,
    cloudLayerBasis: "explicit_layers",
    missingFields: [],
    ...overrides,
  };
}
