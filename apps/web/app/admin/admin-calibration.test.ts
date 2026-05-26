import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminCalibrationPage from "./calibration/page";
import { AdminCalibrationClient } from "./components/admin-calibration-client";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/calibration",
}));

describe("admin calibration UI", () => {
  it("renders the calibration page shell", () => {
    const html = renderToStaticMarkup(React.createElement(AdminCalibrationPage));

    expect(html).toContain("历史校准");
    expect(html).toContain("回放历史天气样本");
  });

  it("renders replay table, outcome form, and stats sections without secret wording", () => {
    const html = renderToStaticMarkup(React.createElement(AdminCalibrationClient));

    expect(html).toContain("校准概览");
    expect(html).toContain("拉取历史天气");
    expect(html).toContain("执行规则回放");
    expect(html).toContain("回放结果");
    expect(html).toContain("观测标注");
    expect(html).toContain("校准统计");
    expect(html).not.toMatch(/api[_-]?key|secret/i);
  });
});
