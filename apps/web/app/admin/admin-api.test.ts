import { describe, expect, it } from "vitest";
import { createProviderConnectionTestRequestInit } from "./admin-api";

describe("admin API request helpers", () => {
  it("sends an empty JSON object for provider connection tests", () => {
    const init = createProviderConnectionTestRequestInit();

    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({}));
  });
});
