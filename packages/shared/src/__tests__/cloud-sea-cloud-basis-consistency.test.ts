import { describe, expect, it } from "vitest";
import {
  buildCloudSeaCloudBasisConsistencyContext,
  cloudSeaCloudBasisMinorMismatchTolerancePercent,
  cloudSeaCloudBasisMixedMismatchThresholdPercent,
} from "../cloud-sea-cloud-basis-consistency.js";

describe("cloud sea cloud basis consistency context", () => {
  it("uses the documented mismatch thresholds", () => {
    expect(cloudSeaCloudBasisMinorMismatchTolerancePercent).toBe(5);
    expect(cloudSeaCloudBasisMixedMismatchThresholdPercent).toBe(15);
  });

  it("classifies total cloud far below a layer as mixed basis", () => {
    const context = buildCloudSeaCloudBasisConsistencyContext([
      {
        time: "2026-05-20T05:00:00+08:00",
        cloudTotalPercent: 20,
        cloudLowPercent: 70,
        cloudMidPercent: 18,
        cloudHighPercent: 12,
      },
    ]);

    expect(context.cloudBasisLevel).toBe("mixed_basis");
    expect(context.mismatchHoursCount).toBe(1);
    expect(context.mismatchFields).toEqual(["low"]);
    expect(context.shouldLowerCloudSeaConfidence).toBe(true);
    expect(context.rowNotesByHour?.["2026-05-20T05:00:00+08:00"]).toBe("口径需复核");
  });

  it("classifies small total-vs-layer gaps above tolerance as minor mismatch", () => {
    const context = buildCloudSeaCloudBasisConsistencyContext([
      {
        time: "2026-05-20T06:00:00+08:00",
        cloudTotalPercent: 60,
        cloudMidPercent: 68,
        cloudLowPercent: 35,
        cloudHighPercent: 28,
      },
    ]);

    expect(context.cloudBasisLevel).toBe("minor_mismatch");
    expect(context.shouldAvoidStrictLayerInterpretation).toBe(true);
    expect(context.shouldLowerCloudSeaConfidence).toBe(true);
    expect(context.rowNotesByHour?.["2026-05-20T06:00:00+08:00"]).toBe("分层参考");
  });

  it("keeps total-only cloud rows separate from layer evidence", () => {
    const context = buildCloudSeaCloudBasisConsistencyContext([
      {
        cloudTotalPercent: 50,
        cloudHighPercent: null,
        cloudMidPercent: null,
        cloudLowPercent: null,
        missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
      },
    ]);

    expect(context.cloudBasisLevel).toBe("total_only");
    expect(context.hasTotalOnlyHours).toBe(true);
    expect(context.comparableHoursCount).toBe(0);
    expect(context.mismatchHoursCount).toBe(0);
    expect(context.professionalSummaryZh).toContain("缺少低/中/高云分层");
  });

  it("classifies explicit partial layers without backfilling missing fields", () => {
    const context = buildCloudSeaCloudBasisConsistencyContext([
      {
        cloudTotalPercent: 50,
        cloudLowPercent: 30,
        cloudMidPercent: null,
        cloudHighPercent: null,
        missingFields: ["cloudMid", "cloudHigh"],
      },
    ]);

    expect(context.cloudBasisLevel).toBe("partial_layers");
    expect(context.hasPartialLayerHours).toBe(true);
    expect(context.missingLayerHoursCount).toBe(1);
    expect(context.mismatchHoursCount).toBe(0);
    expect(context.professionalSummaryZh).toContain("不使用总云量回填");
  });

  it("treats complete layers within tolerance as consistent", () => {
    const context = buildCloudSeaCloudBasisConsistencyContext([
      {
        cloudTotalPercent: 63,
        cloudHighPercent: 25,
        cloudMidPercent: 45,
        cloudLowPercent: 68,
      },
    ]);

    expect(context.cloudBasisLevel).toBe("consistent");
    expect(context.shouldLowerCloudSeaConfidence).toBe(false);
    expect(context.mismatchFields).toEqual([]);
  });
});
