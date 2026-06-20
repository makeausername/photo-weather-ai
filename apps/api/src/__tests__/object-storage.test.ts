import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createObjectStorageProvider,
  normalizeObjectKey,
  type AliyunOssRuntimeConfig,
  type LocalStorageRuntimeConfig,
  type TencentCosRuntimeConfig,
} from "../object-storage.js";

const tempRoots: string[] = [];

function baseLocalConfig(rootPath: string): LocalStorageRuntimeConfig {
  return {
    providerType: "storage",
    providerCode: "local_storage",
    displayName: "本地存储",
    enabled: true,
    priority: 100,
    rootPath,
    basePrefix: "uploads",
    publicBaseUrl: "https://assets.example.com",
    maxUploadBytes: 1024,
  };
}

function baseAliyunConfig(
  overrides: Partial<AliyunOssRuntimeConfig> = {},
): AliyunOssRuntimeConfig {
  return {
    providerType: "storage",
    providerCode: "aliyun_oss",
    displayName: "阿里云 OSS",
    enabled: false,
    priority: 200,
    realCallEnabled: false,
    region: "",
    endpoint: "",
    bucket: "",
    basePrefix: "uploads",
    publicBaseUrl: "",
    forcePathStyle: false,
    timeoutMs: 10000,
    maxUploadBytes: 1024,
    accessKeyId: "",
    accessKeySecret: "",
    ...overrides,
  };
}

function baseTencentConfig(
  overrides: Partial<TencentCosRuntimeConfig> = {},
): TencentCosRuntimeConfig {
  return {
    providerType: "storage",
    providerCode: "tencent_cos",
    displayName: "腾讯云 COS",
    enabled: false,
    priority: 300,
    realCallEnabled: false,
    region: "",
    bucket: "",
    basePrefix: "uploads",
    publicBaseUrl: "",
    timeoutMs: 10000,
    maxUploadBytes: 1024,
    secretId: "",
    secretKey: "",
    ...overrides,
  };
}

describe("object storage providers", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("normalizes safe object keys and rejects traversal", () => {
    expect(normalizeObjectKey("health-check/test.txt", "uploads")).toBe(
      "uploads/health-check/test.txt",
    );
    expect(normalizeObjectKey("uploads/health-check/test.txt", "uploads")).toBe(
      "uploads/health-check/test.txt",
    );

    for (const key of [
      "",
      "/absolute.txt",
      "nested\\windows.txt",
      "nested//empty.txt",
      "../escape.txt",
      "nested/../escape.txt",
      "nested/..hidden.txt",
    ]) {
      expect(() => normalizeObjectKey(key, "uploads")).toThrow();
    }
  });

  it("stores, reads, heads, signs, and deletes local objects below the configured root", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "photo-weather-storage-"));
    tempRoots.push(rootPath);
    const provider = createObjectStorageProvider(baseLocalConfig(rootPath));

    const uploaded = await provider.putObject({
      key: "health-check/local.txt",
      body: "hello",
      contentType: "text/plain",
    });

    expect(uploaded).toMatchObject({
      key: "uploads/health-check/local.txt",
      contentType: "text/plain",
      sizeBytes: 5,
      providerType: "storage",
      providerCode: "local_storage",
      publicUrl: "https://assets.example.com/uploads/health-check/local.txt",
    });
    expect(uploaded.etag).toBeTruthy();

    const head = await provider.headObject({ key: "health-check/local.txt" });
    expect(head).toMatchObject({
      key: "uploads/health-check/local.txt",
      contentType: "text/plain",
      sizeBytes: 5,
    });

    const downloaded = await provider.getObject({ key: "health-check/local.txt" });
    expect(new TextDecoder().decode(downloaded.body)).toBe("hello");
    await expect(provider.createReadUrl({ key: "health-check/local.txt" })).resolves.toBe(
      "https://assets.example.com/uploads/health-check/local.txt",
    );

    await provider.deleteObject({ key: "health-check/local.txt" });
    await expect(provider.headObject({ key: "health-check/local.txt" })).rejects.toThrow();
  });

  it("does not call Aliyun OSS SDK in config-check mode", async () => {
    const provider = createObjectStorageProvider(baseAliyunConfig(), {
      NODE_ENV: "development",
    });

    await expect(provider.testConnection({ realCheck: true })).resolves.toMatchObject({
      success: true,
      mode: "config_check",
      attempted: false,
      messageZh: "当前为配置检查模式，未请求阿里云 OSS 服务。",
    });
  });

  it("does not call Tencent COS SDK in config-check mode", async () => {
    const provider = createObjectStorageProvider(baseTencentConfig(), {
      NODE_ENV: "development",
    });

    await expect(provider.testConnection({ realCheck: true })).resolves.toMatchObject({
      success: true,
      mode: "config_check",
      attempted: false,
      messageZh: "当前为配置检查模式，未请求腾讯云 COS 服务。",
    });
  });

  it("returns safe Chinese missing-field errors for cloud providers", async () => {
    const aliyun = createObjectStorageProvider(
      baseAliyunConfig({
        enabled: true,
        realCallEnabled: true,
        accessKeyId: "aliyun-test-id",
      }),
      { NODE_ENV: "development" },
    );
    const tencent = createObjectStorageProvider(
      baseTencentConfig({
        enabled: true,
        realCallEnabled: true,
        secretId: "tencent-test-id",
      }),
      { NODE_ENV: "development" },
    );

    const aliyunResult = await aliyun.testConnection({ realCheck: true });
    const tencentResult = await tencent.testConnection({ realCheck: true });

    expect(aliyunResult).toMatchObject({
      success: false,
      mode: "config_check",
      attempted: false,
      requiredMissingFields: ["Bucket", "Region 或 Endpoint", "AccessKey Secret"],
    });
    expect(tencentResult).toMatchObject({
      success: false,
      mode: "config_check",
      attempted: false,
      requiredMissingFields: ["Region", "Bucket", "Secret Key"],
    });
    expect(JSON.stringify([aliyunResult, tencentResult])).not.toContain("aliyun-test-id");
    expect(JSON.stringify([aliyunResult, tencentResult])).not.toContain("tencent-test-id");
  });
});
