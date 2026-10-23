import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
const admin = vi.hoisted(() => ({ create: vi.fn(), verify: vi.fn() }));
vi.mock("../create-admin.js", () => ({
  createOrUpdateAdmin: admin.create,
  verifyAdminBootstrap: admin.verify,
  readCreateAdminEnv: (env: NodeJS.ProcessEnv) => {
    if (!env.ADMIN_INITIAL_PASSWORD) throw new Error("initial password required");
    return { email: env.ADMIN_EMAIL, password: env.ADMIN_INITIAL_PASSWORD };
  },
}));
import { initializeFreeDatabase } from "../seed-free.js";

const env = {
  NODE_ENV: "production",
  PUBLIC_SITE_URL: "https://weather.example.com",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_INITIAL_PASSWORD: "Test-only!Password1",
};
function fake(existing = false, commercial = false) {
  admin.create.mockReset();
  admin.verify.mockReset();
  const settings = new Map<string, unknown>();
  const providers = new Map<string, any>();
  const db: any = {
    $transaction: async (operation: (tx: unknown) => unknown) => operation(db),
    billingProduct: { count: async () => (commercial ? 1 : 0) },
    paymentOrder: { count: async () => 0 },
    user: { findUnique: async () => (existing ? { id: "admin", email: env.ADMIN_EMAIL } : null) },
    systemSetting: {
      upsert: async ({ where, create, update }: any) => {
        expect(update).toEqual({});
        if (!settings.has(where.key)) settings.set(where.key, create.valueJson);
      },
    },
    providerConfig: {
      upsert: async ({ create, update }: any) => {
        expect(update).toEqual({});
        if (!providers.has(create.providerCode)) providers.set(create.providerCode, create);
      },
    },
  };
  return { db: db as PrismaClient, settings, providers };
}
describe("free production initialization", () => {
  it("creates only free settings and allowed providers using real free weather", async () => {
    const { db, settings, providers } = fake();
    expect((await initializeFreeDatabase(db, env)).adminCreated).toBe(true);
    expect([...settings.keys()]).toHaveLength(4);
    expect(settings.get("site.baseUrl")).toBe(env.PUBLIC_SITE_URL);
    expect([...providers.keys()]).toEqual(["qweather", "open_meteo", "amap"]);
    expect(providers.get("open_meteo")).toMatchObject({
      enabled: true,
      secretJson: {},
      configJson: { realCallEnabled: true, mode: "free", customerEndpoint: "", modelListLimit: 2 },
    });
    expect(providers.get("qweather").enabled).toBe(false);
    expect(admin.create).toHaveBeenCalledOnce();
  });
  it("preserves existing settings, secrets, disabled sources and admin passwords on repeat", async () => {
    const { db, settings, providers } = fake(true);
    settings.set("site.name", "Saved name");
    const saved = {
      enabled: false,
      secretJson: { apiKey: "saved" },
      configJson: { modelList: "gfs_seamless" },
    };
    providers.set("open_meteo", saved);
    await initializeFreeDatabase(db, { ...env, ADMIN_INITIAL_PASSWORD: "" });
    await initializeFreeDatabase(db, env);
    expect(settings.get("site.name")).toBe("Saved name");
    expect(providers.get("open_meteo")).toEqual(saved);
    expect(admin.create).not.toHaveBeenCalled();
    expect(admin.verify).toHaveBeenCalledTimes(2);
  });
  it("refuses commercial databases without writing", async () => {
    const { db, settings } = fake(false, true);
    await expect(initializeFreeDatabase(db, env)).rejects.toThrow("商业版");
    expect(settings.size).toBe(0);
    expect(admin.create).not.toHaveBeenCalled();
  });
  it("does not promote or reactivate an existing invalid account", async () => {
    const { db, settings } = fake(true);
    admin.verify.mockRejectedValueOnce(new Error("admin disabled"));
    await expect(initializeFreeDatabase(db, env)).rejects.toThrow("admin disabled");
    expect(settings.size).toBe(0);
    expect(admin.create).not.toHaveBeenCalled();
  });
  it("requires a valid HTTPS production URL before writes", async () => {
    const { db, settings } = fake();
    await expect(
      initializeFreeDatabase(db, { ...env, PUBLIC_SITE_URL: "http://example.com" }),
    ).rejects.toThrow("HTTPS");
    expect(settings.size).toBe(0);
  });
});
