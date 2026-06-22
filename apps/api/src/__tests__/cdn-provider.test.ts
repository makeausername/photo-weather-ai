import { describe, expect, it, vi } from "vitest";
import {
  createCdnProvider,
  type AliyunCdnRuntimeConfig,
  type TencentCdnRuntimeConfig,
} from "../cdn-provider.js";

function baseAliyunConfig(
  overrides: Partial<AliyunCdnRuntimeConfig> = {},
): AliyunCdnRuntimeConfig {
  return {
    providerType: "cdn",
    providerCode: "aliyun_cdn",
    displayName: "阿里云 CDN",
    enabled: true,
    priority: 100,
    realCallEnabled: true,
    endpoint: "https://cdn.aliyuncs.com",
    domains: ["cdn.example.com"],
    defaultRefreshType: "file",
    timeoutMs: 10000,
    retryCount: 0,
    rateLimitPerMinute: 60,
    dryRun: false,
    accessKeyId: "aliyun-access-id",
    accessKeySecret: "aliyun-access-secret",
    ...overrides,
  };
}

function baseTencentConfig(
  overrides: Partial<TencentCdnRuntimeConfig> = {},
): TencentCdnRuntimeConfig {
  return {
    providerType: "cdn",
    providerCode: "tencent_cdn",
    displayName: "腾讯云 CDN",
    enabled: true,
    priority: 200,
    realCallEnabled: true,
    endpoint: "https://cdn.tencentcloudapi.com",
    region: "",
    domains: ["cdn.example.com"],
    defaultPurgeType: "url",
    timeoutMs: 10000,
    retryCount: 0,
    rateLimitPerMinute: 60,
    dryRun: false,
    secretId: "tencent-secret-id",
    secretKey: "tencent-secret-key",
    ...overrides,
  };
}

describe("CDN providers", () => {
  it("signs Aliyun CDN refresh requests through a mocked fetcher", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://cdn.aliyuncs.com");
      expect(url.searchParams.get("Action")).toBe("RefreshObjectCaches");
      expect(url.searchParams.get("ObjectType")).toBe("File");
      expect(url.searchParams.get("ObjectPath")).toBe("https://cdn.example.com/app.js");
      expect(url.searchParams.get("AccessKeyId")).toBe("aliyun-access-id");
      expect(url.searchParams.get("Signature")).toBeTruthy();
      expect(init?.method).toBe("GET");
      expect(String(input)).not.toContain("aliyun-access-secret");

      return new Response(JSON.stringify({ RefreshTaskId: "aliyun-task-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = createCdnProvider(baseAliyunConfig(), {
      env: { NODE_ENV: "development" },
      fetcher: fetchMock as typeof fetch,
    });

    const result = await provider.refreshUrls({
      urls: ["https://cdn.example.com/app.js"],
      caller: "admin",
    });

    expect(result).toMatchObject({
      success: true,
      providerCode: "aliyun_cdn",
      mode: "real",
      acceptedCount: 1,
      providerTaskId: "aliyun-task-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs Tencent CDN refresh requests through a mocked fetcher", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://cdn.tencentcloudapi.com");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-tc-action")).toBe("PurgeUrlsCache");
      expect(headers.get("x-tc-version")).toBe("2018-06-06");
      expect(headers.get("authorization")).toContain("TC3-HMAC-SHA256");
      expect(headers.get("authorization")).toContain("Credential=tencent-secret-id/");
      expect(headers.get("authorization")).not.toContain("tencent-secret-key");
      expect(JSON.parse(String(init?.body))).toEqual({
        Urls: ["https://cdn.example.com/app.js"],
      });

      return new Response(JSON.stringify({ Response: { TaskId: "tencent-task-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = createCdnProvider(baseTencentConfig(), {
      env: { NODE_ENV: "development" },
      fetcher: fetchMock as typeof fetch,
    });

    const result = await provider.refreshUrls({
      urls: ["https://cdn.example.com/app.js"],
      caller: "admin",
    });

    expect(result).toMatchObject({
      success: true,
      providerCode: "tencent_cdn",
      mode: "real",
      acceptedCount: 1,
      providerTaskId: "tencent-task-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never calls real CDN APIs under NODE_ENV=test", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("CDN provider must not call network under test");
    });
    const provider = createCdnProvider(baseTencentConfig(), {
      env: { NODE_ENV: "test" },
      fetcher: fetchMock as typeof fetch,
    });

    await expect(
      provider.prefetchUrls({
        urls: ["https://cdn.example.com/app.js"],
        caller: "admin",
      }),
    ).resolves.toMatchObject({
      success: true,
      mode: "mock",
      acceptedCount: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe CDN operation URLs before signing", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("unsafe CDN URL must not be fetched");
    });
    const provider = createCdnProvider(baseAliyunConfig(), {
      env: { NODE_ENV: "development" },
      fetcher: fetchMock as typeof fetch,
    });

    await expect(
      provider.refreshUrls({
        urls: ["http://127.0.0.1/app.js"],
        caller: "admin",
      }),
    ).rejects.toThrow("CDN 操作不允许 localhost、内网或本机地址。");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
