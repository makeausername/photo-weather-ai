import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

const tempRoots: string[] = [];

function storageObjectUrl(pathname: string, key = "health-check/manual-test.txt"): string {
  return `${pathname}?providerCode=local_storage&key=${encodeURIComponent(key)}`;
}

describe("admin storage routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("returns storage provider config-check mode when real calls are disabled", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/storage/aliyun_oss/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      providerType: "storage",
      providerCode: "aliyun_oss",
      providerNameZh: "阿里云 OSS",
      mode: "config_check",
      connectionMode: "mock",
      attempted: false,
      message: "当前为配置检查模式，未请求阿里云 OSS 服务。",
    });
  });

  it("returns safe storage missing-field errors without exposing secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("storage:aliyun_oss");
    state.providers.set("storage:aliyun_oss", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        bucket: "",
        region: "",
        endpoint: "",
      },
      secretJson: {
        accessKeyId: "aliyun-route-secret-id",
      },
      maskedSecretJson: {
        accessKeyId: "aliy****t-id",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/storage/aliyun_oss/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      mode: "config_check",
      attempted: false,
      requiredMissingFields: ["Bucket", "Region 或 Endpoint", "AccessKey Secret"],
      message: "阿里云 OSS 真实调用已开启，请补充：Bucket、Region 或 Endpoint、AccessKey Secret。本次未请求对象存储服务。",
    });
    expect(response.body).not.toContain("aliyun-route-secret-id");
    expect(response.body).not.toContain("secretJson");
  });

  it("keeps manual storage object APIs admin-only", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const unauthenticatedUpload = await app.inject({
      method: "POST",
      url: "/admin/storage/test-upload",
      payload: {},
    });
    const unauthenticatedDownload = await app.inject({
      method: "GET",
      url: storageObjectUrl("/admin/storage/test-download"),
    });
    const unauthenticatedDelete = await app.inject({
      method: "DELETE",
      url: storageObjectUrl("/admin/storage/test-object"),
    });
    const nonAdminUpload = await app.inject({
      method: "POST",
      url: "/admin/storage/test-upload",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {},
    });

    expect(unauthenticatedUpload.statusCode).toBe(401);
    expect(unauthenticatedDownload.statusCode).toBe(401);
    expect(unauthenticatedDelete.statusCode).toBe(401);
    expect(nonAdminUpload.statusCode).toBe(403);
  });

  it("uploads, downloads, and deletes a local manual test object without exposing paths", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const rootPath = await mkdtemp(join(tmpdir(), "photo-weather-admin-storage-"));
    tempRoots.push(rootPath);
    const provider = state.providers.get("storage:local_storage");
    state.providers.set("storage:local_storage", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        rootPath,
        publicBaseUrl: "",
        basePrefix: "uploads",
        maxUploadBytes: 10485760,
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const upload = await app.inject({
      method: "POST",
      url: "/admin/storage/test-upload",
      headers: adminAuthorizationHeader(),
      payload: {
        providerCode: "local_storage",
        key: "health-check/manual-test.txt",
        content: "hello",
        contentType: "text/plain",
      },
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({
      success: true,
      providerType: "storage",
      providerCode: "local_storage",
      object: {
        key: "uploads/health-check/manual-test.txt",
        contentType: "text/plain",
        sizeBytes: 5,
      },
      readUrl: null,
    });
    expect(upload.body).not.toContain(rootPath);

    const download = await app.inject({
      method: "GET",
      url: storageObjectUrl("/admin/storage/test-download"),
      headers: adminAuthorizationHeader(),
    });
    expect(download.statusCode).toBe(200);
    expect(download.json()).toMatchObject({
      success: true,
      content: "hello",
      object: {
        key: "uploads/health-check/manual-test.txt",
      },
    });
    expect(download.body).not.toContain(rootPath);

    const deleted = await app.inject({
      method: "DELETE",
      url: storageObjectUrl("/admin/storage/test-object"),
      headers: adminAuthorizationHeader(),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      success: true,
      providerCode: "local_storage",
    });
    expect(deleted.body).not.toContain(rootPath);

    const missingDownload = await app.inject({
      method: "GET",
      url: storageObjectUrl("/admin/storage/test-download"),
      headers: adminAuthorizationHeader(),
    });
    expect(missingDownload.statusCode).toBe(400);
    expect(missingDownload.json()).toMatchObject({
      error: "storage_test_download_failed",
      message: "对象不存在。",
    });
    expect(missingDownload.body).not.toContain(rootPath);
  });
});
