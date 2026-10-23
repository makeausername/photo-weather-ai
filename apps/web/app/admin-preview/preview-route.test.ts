import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, usePathname: () => "/admin-preview" }));
import AdminPreviewPage from "./[[...section]]/page";
afterEach(() => { vi.unstubAllEnvs(); });
describe("preview route environment boundary", () => {
  it("returns old history bookmarks to the new overview", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    await expect(AdminPreviewPage({params:Promise.resolve({section:["history"]})})).rejects.toThrow("REDIRECT:/admin-preview");
  });
  it("is unavailable in production even with preview enabled", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    await expect(AdminPreviewPage({params:Promise.resolve({})})).rejects.toThrow("NOT_FOUND");
  });
  it("requires explicit opt-in in development", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("LOCAL_ADMIN_PREVIEW", "false");
    await expect(AdminPreviewPage({params:Promise.resolve({})})).rejects.toThrow("NOT_FOUND");
  });
  it("does not expose arbitrary legacy pages through the preview", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
    await expect(AdminPreviewPage({params:Promise.resolve({section:["users"]})})).rejects.toThrow("NOT_FOUND");
  });
});
