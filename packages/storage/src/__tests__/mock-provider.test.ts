import { describe, expect, it } from "vitest";
import { MockStorageProvider } from "../index";

describe("MockStorageProvider", () => {
  it("uploads, downloads, signs, and deletes without external storage", async () => {
    const provider = new MockStorageProvider();
    const uploaded = await provider.upload({
      key: "reports/mock.txt",
      body: "sample",
      contentType: "text/plain",
    });

    expect(uploaded.url).toBe("mock://storage/reports/mock.txt");
    expect(await provider.download("reports/mock.txt")).toEqual(new TextEncoder().encode("sample"));
    expect(await provider.getSignedUrl("reports/mock.txt")).toBe(
      "mock://storage/reports/mock.txt?expiresIn=300",
    );

    await provider.delete("reports/mock.txt");
    await expect(provider.download("reports/mock.txt")).rejects.toThrow("Mock object not found");
  });
});
