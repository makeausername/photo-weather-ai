import { describe, expect, it } from "vitest";
import { coordinatesSchema, type Coordinates } from "../index";

describe("shared package imports", () => {
  it("exports reusable schemas and types", () => {
    const coordinates: Coordinates = {
      latitude: 30.129,
      longitude: 118.169,
      system: "wgs84",
    };

    expect(coordinatesSchema.parse(coordinates)).toEqual(coordinates);
  });
});
