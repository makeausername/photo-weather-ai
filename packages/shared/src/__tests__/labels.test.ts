import { describe, expect, it } from "vitest";
import {
  getLocationSourceLabel,
  getLocationTypeLabel,
  getViewDirectionLabel,
  locationSourceLabels,
  locationTypeLabels,
  viewDirectionLabels,
} from "../index";

describe("Chinese enum labels", () => {
  it("maps location and photo spot enum codes to Simplified Chinese labels", () => {
    expect(getLocationTypeLabel("scenic_area")).toBe("景区");
    expect(getLocationSourceLabel("amap")).toBe("高德地图");
    expect(getViewDirectionLabel("northeast")).toBe("东北");
  });

  it("does not expose raw enum values as labels", () => {
    expect(locationTypeLabels.scenic_area).not.toBe("scenic_area");
    expect(locationSourceLabels.manual).not.toBe("manual");
    expect(viewDirectionLabels.unknown).not.toBe("unknown");
  });
});
