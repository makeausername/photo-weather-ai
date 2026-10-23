import { describe, expect, it, vi, afterEach } from "vitest";
import { previewAdminRequest } from "./preview-data";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SafeProviderConfig } from "../admin/admin-api";
afterEach(() => { vi.unstubAllGlobals(); });
describe("isolated local admin preview", () => {
  it("never fetches real data or executes a write/test task", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const method of ["POST", "PATCH", "DELETE"])
      await expect(
        previewAdminRequest("/admin/providers/weather/qweather", { method, body: "{}" }),
      ).rejects.toThrow("只读预览");
    await expect(previewAdminRequest("/admin/users")).rejects.toThrow("不发起真实请求");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns only the requested example providers with no credentials", async () => {
    const result = await previewAdminRequest<{ providers: SafeProviderConfig[] }>(
      "/admin/providers?providerType=weather",
    );
    expect(result.providers.map((p) => p.providerCode)).toEqual(["qweather", "open_meteo"]);
    expect(result.providers.every((p) => p.maskedSecretJson === null)).toBe(true);
    Object.assign(result.providers[0]!, { enabled: true });
    const next = await previewAdminRequest<typeof result>("/admin/providers?providerType=weather");
    expect(next.providers[0]!.enabled).toBe(false);
  });
  it("does not present old history as loaded records", async () => {
    expect(await previewAdminRequest("/admin/audit-logs")).toEqual({ logs: [] });
  });
  it("gates preview on development AND explicit opt-in, leaving admin auth intact", () => {
    const page = readFileSync(resolve("app/admin-preview/[[...section]]/page.tsx"), "utf8");
    expect(page).toContain('process.env.NODE_ENV !== "development"');
    expect(page).toContain('process.env.LOCAL_ADMIN_PREVIEW !== "true"');
    expect(page).toContain("notFound()");
    const gate = readFileSync(resolve("app/admin/components/admin-auth-gate.tsx"), "utf8");
    expect(gate).not.toContain("preview");
    expect(gate).toContain("sessionHasAdminAccess");
  });
});
