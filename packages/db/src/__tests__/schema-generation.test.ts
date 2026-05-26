import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("Prisma schema", () => {
  it("generates the Prisma client without a database connection", () => {
    const schemaPath = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));
    const prismaCliPath = require.resolve("prisma/build/index.js");

    expect(() => {
      execFileSync(
        process.execPath,
        [prismaCliPath, "generate", "--schema", schemaPath, "--no-engine"],
        {
          env: {
            ...process.env,
            DATABASE_URL:
              "postgresql://photo_weather_ai:CHANGE_ME@127.0.0.1:15432/photo_weather_ai?schema=public",
          },
          stdio: "pipe",
        },
      );
    }).not.toThrow();
  });
});
