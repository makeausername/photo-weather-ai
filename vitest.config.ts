import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@photo-weather/ai": fromRoot("./packages/ai/src/index.ts"),
      "@photo-weather/astro": fromRoot("./packages/astro/src/index.ts"),
      "@photo-weather/billing": fromRoot("./packages/billing/src/index.ts"),
      "@photo-weather/calibration": fromRoot("./packages/calibration/src/index.ts"),
      "@photo-weather/calendar": fromRoot("./packages/calendar/src/index.ts"),
      "@photo-weather/config": fromRoot("./packages/config/src/index.ts"),
      "@photo-weather/db": fromRoot("./packages/db/src/index.ts"),
      "@photo-weather/geo": fromRoot("./packages/geo/src/index.ts"),
      "@photo-weather/scoring": fromRoot("./packages/scoring/src/index.ts"),
      "@photo-weather/shared": fromRoot("./packages/shared/src/index.ts"),
      "@photo-weather/storage": fromRoot("./packages/storage/src/index.ts"),
      "@photo-weather/terrain": fromRoot("./packages/terrain/src/index.ts"),
      "@photo-weather/weather": fromRoot("./packages/weather/src/index.ts"),
    },
  },
});
