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
  it("removes fixed location management from the admin shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminShell, {
        title: "控制台",
        description: "后台状态",
        children: React.createElement("div", null, "content"),
      }),
    );

    expect(html).toContain("历史校准");
    expect(html).not.toContain("地点管理");
    expect(html).not.toContain("/admin/locations");
    expect(html).not.toContain("机位管理");
    expect(html).not.toContain("/admin/photo-spots");
  });

  it("redirects the retired location page to historical calibration", () => {
    expect(() => AdminLocationsPage()).toThrow("redirect:/admin/calibration");

    expect(redirectMock).toHaveBeenCalledWith("/admin/calibration");
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

  it("keeps the dashboard focused on active admin modules", () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboardClient));

    expect(html).toContain("服务商配置");
    expect(html).not.toContain("地点数量");
    expect(html).not.toContain("地点资料");
    expect(html).not.toContain("新增地点");
    expect(html).not.toContain("机位数量");
    expect(html).not.toContain("/admin/locations");
    expect(html).not.toContain("/admin/photo-spots");
  });

  it("redirects the retired photo spot page to the admin console", () => {
    expect(() => AdminPhotoSpotsPage()).toThrow("redirect:/admin");

    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
