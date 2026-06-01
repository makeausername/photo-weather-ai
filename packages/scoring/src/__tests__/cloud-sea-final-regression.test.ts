import { describe, expect, it } from "vitest";
import { classifyCloudLayerRoles } from "../cloud-layer-roles.js";

describe("Cloud Sea final regression cloud-layer roles", () => {
  it("keeps high-mountain low-cloud evidence eligible for cloud sea", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 86,
      cloudHighPercent: 24,
      cloudMidPercent: 32,
      cloudLowPercent: 68,
      cloudLayerBasis: "explicit_layers",
      relativeHumidityPercent: 92,
      dewPointSpreadC: 2,
      visibilityKm: 14,
      windSpeedMs: 2.6,
      terrainMode: "high_mountain",
      terrainScore: 88,
      lightPhase: "sunrise",
    });

    expect(roles.primaryCloudRole).toBe("cloud_sea");
    expect(["medium", "strong"]).toContain(roles.cloudSeaLayerSignal);
  });

  it("routes mid/high-cloud-only cases to glow or texture instead of cloud sea", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 92,
      cloudHighPercent: 86,
      cloudMidPercent: 74,
      cloudLowPercent: 12,
      cloudLayerBasis: "explicit_layers",
      relativeHumidityPercent: 62,
      dewPointSpreadC: 7,
      visibilityKm: 22,
      windSpeedMs: 4,
      terrainMode: "high_mountain",
      terrainScore: 88,
      lightPhase: "sunrise",
    });

    expect(["glow_reference", "texture"]).toContain(roles.primaryCloudRole);
    expect(roles.cloudSeaLayerSignal).toBe("none");
  });

  it("keeps total-cloud-only rows in needs-review state", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 88,
      cloudHighPercent: null,
      cloudMidPercent: null,
      cloudLowPercent: null,
      cloudLayerBasis: "total_only",
      relativeHumidityPercent: 92,
      dewPointSpreadC: 2,
      visibilityKm: 14,
      windSpeedMs: 2.6,
      terrainMode: "high_mountain",
      terrainScore: 88,
      lightPhase: "sunrise",
    });

    expect(roles.primaryCloudRole).toBe("needs_review");
    expect(roles.cloudSeaLayerSignal).toBe("none");
    expect(roles.whiteoutLayerSignal).toBe("none");
  });
});
