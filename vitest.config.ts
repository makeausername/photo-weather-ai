import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@photo-weather/ai": new URL("./packages/ai/src/index.ts", import.meta.url).pathname,
      "@photo-weather/astro": new URL("./packages/astro/src/index.ts", import.meta.url).pathname,
      "@photo-weather/billing": new URL("./packages/billing/src/index.ts", import.meta.url)
        .pathname,
      "@photo-weather/config": new URL("./packages/config/src/index.ts", import.meta.url).pathname,
      "@photo-weather/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@photo-weather/geo": new URL("./packages/geo/src/index.ts", import.meta.url).pathname,
      "@photo-weather/scoring": new URL("./packages/scoring/src/index.ts", import.meta.url)
        .pathname,
      "@photo-weather/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@photo-weather/storage": new URL("./packages/storage/src/index.ts", import.meta.url)
        .pathname,
      "@photo-weather/terrain": new URL("./packages/terrain/src/index.ts", import.meta.url)
        .pathname,
      "@photo-weather/weather": new URL("./packages/weather/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
