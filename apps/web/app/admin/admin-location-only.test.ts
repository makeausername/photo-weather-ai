import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminLocationsPage from "./locations/page";
import AdminPhotoSpotsPage from "./photo-spots/page";
import { AdminCalibrationClient } from "./components/admin-calibration-client";
import { AdminDashboardClient } from "./components/admin-dashboard-client";
import { AdminShell } from "./components/admin-shell";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/admin/calibration",
}));

describe("location-only admin surfaces", () => {
  it("removes location management from the primary navigation", () => {
    const html = renderToStaticMarkup(React.createElement(AdminShell, {title:"运行总览",description:"后台状态",children:React.createElement("div")}));
    expect(html).not.toContain("地点与机位");
    expect(html).not.toContain("/admin/locations");
    expect(html).not.toContain("/admin/photo-spots");
    expect(html).toContain("天气数据");
  });
  it("redirects the removed location page without touching historical data", () => {
    expect(() => AdminLocationsPage()).toThrow("redirect:/admin");
  });

  it("renders manual calibration location fields without a fixed location dropdown", () => {
    const html = renderToStaticMarkup(React.createElement(AdminCalibrationClient));

    expect(html).toContain("地点名称");
    expect(html).toContain("WGS84 纬度");
    expect(html).toContain("WGS84 经度");
    expect(html).toContain("时区");
    expect(html).toContain("搜索地点");
    expect(html).not.toContain("请选择地点");
    expect(html).not.toContain("新增地点");
    expect(html).not.toContain("地点列表");
  });

  it("keeps revenue and commercial metrics off the dashboard", () => {
    const html=renderToStaticMarkup(React.createElement(AdminDashboardClient));
    expect(html).toContain("天气数据源");
    expect(html).not.toContain("订单收入");
    expect(html).not.toContain("活跃用户");
  });

  it("redirects the retired photo spot page to the admin console", () => {
    expect(() => AdminPhotoSpotsPage()).toThrow("redirect:/admin");

    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
