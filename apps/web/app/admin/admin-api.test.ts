import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
} from "../../components/auth-errors";
import { createProviderConnectionTestRequestInit, loginAdmin } from "./admin-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin API request helpers", () => {
  it("sends an empty JSON object for provider connection tests", () => {
    const init = createProviderConnectionTestRequestInit();

    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({}));
  });

  it("shows invalid credentials without exposing response internals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_credentials", message: invalidCredentialsMessage }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(loginAdmin("admin@example.com", "wrong-password")).rejects.toThrow(
      invalidCredentialsMessage,
    );
  });

  it("sanitizes raw database failures during admin login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "Invalid `prisma.user.findUnique()` invocation: Authentication failed against database server at `postgres`.\n    at login (auth-routes.ts:1:1)",
        { status: 503 },
      ),
    );

    await expect(loginAdmin("admin@example.com", "CorrectHorseBattery99")).rejects.toThrow(
      loginServiceUnavailableMessage,
    );
  });
});
