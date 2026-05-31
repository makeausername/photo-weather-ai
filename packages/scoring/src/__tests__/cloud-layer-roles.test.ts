import { describe, expect, it } from "vitest";
import { classifyCloudLayerRoles } from "../cloud-layer-roles.js";

describe("cloud layer role classification", () => {
  it("routes high-cloud-only sunrise rows to glow reference instead of cloud sea", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 88,
      cloudHighPercent: 86,
      cloudMidPercent: 22,
      cloudLowPercent: 12,
      cloudLayerBasis: "explicit_layers",
      relativeHumidityPercent: 58,
      dewPointSpreadC: 8,
      visibilityKm: 24,
      windSpeedMs: 4,
      terrainMode: "high_mountain",
      lightPhase: "sunrise",
    });

    expect(roles.primaryCloudRole).toBe("glow_reference");
    expect(roles.cloudSeaLayerSignal).toBe("none");
    expect(roles.noteZh).toContain("霞光参考");
  });

  it("routes mid-cloud-only rows to texture or glow reference instead of cloud sea", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 78,
      cloudHighPercent: 28,
      cloudMidPercent: 82,
      cloudLowPercent: 16,
      cloudLayerBasis: "explicit_layers",
      relativeHumidityPercent: 62,
      dewPointSpreadC: 7,
      visibilityKm: 18,
      windSpeedMs: 3,
      terrainMode: "mountain",
    });

    expect(["texture", "glow_reference"]).toContain(roles.primaryCloudRole);
    expect(roles.cloudSeaLayerSignal).toBe("none");
  });

  it("marks total-cloud-only rows as needs review without cloud sea confidence", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 96,
      cloudHighPercent: null,
      cloudMidPercent: null,
      cloudLowPercent: null,
      cloudLayerBasis: "total_only",
      relativeHumidityPercent: 92,
      dewPointSpreadC: 2,
      visibilityKm: 10,
      windSpeedMs: 2,
      terrainMode: "high_mountain",
    });

    expect(roles.primaryCloudRole).toBe("needs_review");
    expect(roles.cloudSeaLayerSignal).toBe("none");
    expect(roles.whiteoutLayerSignal).toBe("none");
  });

  it("keeps low-cloud humid rows as cloud sea formation candidates", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 74,
      cloudHighPercent: 24,
      cloudMidPercent: 32,
      cloudLowPercent: 62,
      cloudLayerBasis: "explicit_layers",
      relativeHumidityPercent: 93,
      dewPointSpreadC: 2,
      visibilityKm: 14,
      windSpeedMs: 2.5,
      terrainMode: "high_mountain",
      terrainScore: 88,
      lightPhase: "sunrise",
    });

    expect(["medium", "strong"]).toContain(roles.cloudSeaLayerSignal);
    expect(roles.primaryCloudRole).toBe("cloud_sea");
  });

  it("does not produce confident cloud sea when low cloud is missing", () => {
    const roles = classifyCloudLayerRoles({
      cloudTotalPercent: 84,
      cloudHighPercent: 78,
      cloudMidPercent: 68,
      cloudLowPercent: null,
      cloudLayerBasis: "partial_layers",
      relativeHumidityPercent: 90,
      dewPointSpreadC: 2,
      visibilityKm: 12,
      windSpeedMs: 2,
      terrainMode: "high_mountain",
      lightPhase: "sunrise",
    });

    expect(roles.cloudSeaLayerSignal).toBe("none");
    expect(roles.primaryCloudRole).toBe("needs_review");
  });
});
