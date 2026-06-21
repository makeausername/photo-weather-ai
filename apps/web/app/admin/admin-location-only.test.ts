import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AdminPhotoSpotsPage from "./photo-spots/page";
import { AdminDashboardClient } from "./components/admin-dashboard-client";
import { AdminLocationsClient } from "./components/admin-locations-client";
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
  usePathname: () => "/admin/locations",
}));

describe("location-only admin surfaces", () => {
  it("removes photo spot management from the admin shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminShell, {
        title: "地点管理",
        description: "地点资料",
        children: React.createElement("div", null, "content"),
      }),
    );

    expect(html).toContain("地点管理");
    expect(html).not.toContain("机位管理");
    expect(html).not.toContain("/admin/photo-spots");
  });

  it("renders location management without the old tab switcher", () => {
    const html = renderToStaticMarkup(React.createElement(AdminLocationsClient));

    expect(html).toContain("地点资料");
    expect(html).toContain("新增地点");
    expect(html).not.toContain("机位管理");
    expect(html).not.toContain("/admin/photo-spots");
    expect(html).not.toContain("该地点下的机位");
  });

  it("keeps the dashboard location-only", () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboardClient));

    expect(html).toContain("地点数量");
    expect(html).not.toContain("机位数量");
    expect(html).not.toContain("/admin/photo-spots");
  });

  it("redirects the retired photo spot page to locations", () => {
    expect(() => AdminPhotoSpotsPage()).toThrow("redirect:/admin/locations");

    expect(redirectMock).toHaveBeenCalledWith("/admin/locations");
  });
});
