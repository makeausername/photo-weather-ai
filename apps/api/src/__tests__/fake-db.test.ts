import { describe, expect, it } from "vitest";
import { createFakeDatabaseClient } from "./fake-db.js";

describe("fake database client", () => {
  it("starts without seeded photo spots while keeping the legacy delegate", async () => {
    const { client, state } = await createFakeDatabaseClient();

    expect(state.photoSpots.size).toBe(0);
    expect(client.photoSpot).toBeDefined();
    await expect(client.photoSpot!.findMany()).resolves.toEqual([]);
  });
});
