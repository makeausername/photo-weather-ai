import { describe, expect, it } from "vitest";
import { publicHeaderActionLabels } from "../../components/public-header";
import { shouldShowAdminEntry } from "../../components/account-session";

describe("public account navigation", () => {
  it("uses a unified account entry instead of a top-level admin action", () => {
    expect(publicHeaderActionLabels).toContain("账户");
    expect(publicHeaderActionLabels).toContain("开始分析");
    expect(publicHeaderActionLabels).not.toContain("管理后台");
    expect(publicHeaderActionLabels).not.toContain("登录");
  });

  it("shows admin entry only when admin permissions are present", () => {
    expect(shouldShowAdminEntry({ permissions: ["admin.manage"] })).toBe(true);
    expect(shouldShowAdminEntry({ permissions: ["locations.manage"] })).toBe(false);
    expect(shouldShowAdminEntry(null)).toBe(false);
  });
});
