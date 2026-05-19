import { sanitizeAuditJson } from "../audit.js";
import { maskSecretJson, maskSecretString, maskSecretValue } from "../secrets.js";
import { describe, expect, it } from "vitest";

describe("secret masking", () => {
  it("masks strings while preserving short empty values", () => {
    expect(maskSecretString("")).toBe("");
    expect(maskSecretString("abcd")).toBe("****");
    expect(maskSecretString("abcdef")).toBe("ab****ef");
    expect(maskSecretString("sk-1234567890")).toBe("sk-1****7890");
  });

  it("masks nested secret JSON without leaking primitive values", () => {
    expect(
      maskSecretValue({
        apiKey: "sk-1234567890",
        nested: {
          secretId: "abcdef",
          enabled: true,
        },
        tokens: ["first-token", "second-token"],
      }),
    ).toEqual({
      apiKey: "sk-1****7890",
      nested: {
        secretId: "ab****ef",
        enabled: "****",
      },
      tokens: ["firs****oken", "seco****oken"],
    });
  });

  it("uses an empty object for missing secret JSON", () => {
    expect(maskSecretJson(null)).toEqual({});
    expect(maskSecretJson(undefined)).toEqual({});
  });

  it("redacts secret-like audit metadata fields", () => {
    expect(
      sanitizeAuditJson({
        providerCode: "deepseek",
        apiKey: "sk-1234567890",
        config: {
          baseUrl: "https://api.deepseek.com",
          accessKeySecret: "oss-secret",
        },
      }),
    ).toEqual({
      providerCode: "deepseek",
      apiKey: "sk-1****7890",
      config: {
        baseUrl: "https://api.deepseek.com",
        accessKeySecret: "oss-****cret",
      },
    });
  });
});
