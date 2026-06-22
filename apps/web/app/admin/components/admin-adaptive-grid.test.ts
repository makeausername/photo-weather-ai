import { describe, expect, it } from "vitest";
import {
  getAdaptiveGridClassName,
  getAdaptiveGridItemClassName,
} from "./admin-adaptive-grid";

describe("admin adaptive grid helpers", () => {
  it("keeps a single item full width", () => {
    expect(getAdaptiveGridClassName(1)).toBe("grid min-w-0 gap-3");
    expect(getAdaptiveGridItemClassName(1, 0)).toContain("md:col-span-2");
  });

  it("spans odd last items in a two-column rhythm", () => {
    expect(getAdaptiveGridClassName(3)).toContain("md:grid-cols-2");
    expect(getAdaptiveGridItemClassName(3, 2)).toContain("md:col-span-2");
    expect(getAdaptiveGridItemClassName(5, 4)).toContain("md:col-span-2");
    expect(getAdaptiveGridItemClassName(5, 3)).not.toContain("md:col-span-2");
  });

  it("allows truly compact metric rows to use three or four columns", () => {
    expect(
      getAdaptiveGridClassName(3, {
        variant: "metric",
        allowThreeMetricColumns: true,
      }),
    ).toContain("sm:grid-cols-3");
    expect(
      getAdaptiveGridClassName(4, {
        variant: "metric",
        allowFourMetricColumns: true,
      }),
    ).toContain("xl:grid-cols-4");
  });

  it("uses balanced three-column rows for six compact metrics", () => {
    expect(
      getAdaptiveGridClassName(6, {
        variant: "metric",
        allowThreeMetricColumns: true,
      }),
    ).toContain("xl:grid-cols-3");
  });
});
