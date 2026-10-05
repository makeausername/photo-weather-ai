import { describe, expect, it } from "vitest";
import { cloudConsistentWeatherText } from "../weather-text.js";
import { terrainCloudSubject } from "../terrain-mode.js";

describe("weather evidence vocabulary", () => {
  it.each([85, 100])(
    "marks clear text with %i percent cloud as disputed without inventing rain or opacity",
    (cloud) => {
      expect(cloudConsistentWeatherText("晴", [cloud, 0, 0, 0])).toBe("云量预报有分歧");
      expect(cloudConsistentWeatherText("少云", [null, cloud])).toBe("云量预报有分歧");
    },
  );
  it.each(["雨夹雪", "雷阵雨", "雾", "多云", null])(
    "preserves weather types and missing text: %s",
    (text) => {
      expect(cloudConsistentWeatherText(text, [100])).toBe(text);
    },
  );
  it("does not turn missing clouds into zero or change clear weather with low cloud amount", () => {
    expect(cloudConsistentWeatherText("晴", [null, undefined, NaN])).toBe("晴");
    expect(cloudConsistentWeatherText("晴", [0, 20, 84])).toBe("晴");
  });
  it.each([3041, 3433, 3723])("requires relative terrain evidence at %i m", (elevationMeters) => {
    expect(terrainCloudSubject({ elevationMeters, terrainType: "unknown" })).toBe("云雾");
    expect(
      terrainCloudSubject({ elevationMeters, terrainType: "city", localReliefMeters: 600 }),
    ).toBe("晨雾");
    expect(terrainCloudSubject({ elevationMeters, terrainType: "lake" })).toBe("晨雾");
    expect(terrainCloudSubject({ elevationMeters, terrainType: "valley" })).toBe("云雾");
    expect(terrainCloudSubject({ elevationMeters, terrainType: "ridge" })).toBe("云海");
    expect(terrainCloudSubject({ elevationMeters, localReliefMeters: 299 })).toBe("云雾");
    expect(terrainCloudSubject({ elevationMeters, localReliefMeters: 300 })).toBe("云海");
  });
  it("distinguishes coastal, hill, missing and relative valley-height evidence", () => {
    expect(terrainCloudSubject({ elevationMeters: 6 })).toBe("晨雾");
    expect(terrainCloudSubject({ elevationMeters: 620, localReliefMeters: 260 })).toBe("云雾");
    expect(terrainCloudSubject({})).toBe("云雾");
    expect(terrainCloudSubject({ elevationMeters: 1900, nearbyValleyElevationMeters: 610 })).toBe(
      "云海",
    );
  });
});
