import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const cloudSeaRuleFiles = [
  "apps/web/app/forecast/cloud-sea-rule-context.ts",
  "apps/web/app/forecast/cloud-sea-terrain-context.ts",
  "apps/web/app/forecast/cloud-sea-display-temperature.ts",
  "apps/web/app/forecast/forecast-result-view-model.ts",
  "packages/shared/src/cloud-sea-recommendation-guard.ts",
  "packages/shared/src/cloud-sea-weather-variable-consistency.ts",
  "packages/shared/src/terrain-temperature-basis.ts",
  "packages/shared/src/cloud-sea-cloud-basis-consistency.ts",
  "packages/shared/src/cloud-layer-completeness.ts",
  "packages/scoring/src/cloud-sea-analysis.ts",
  "packages/scoring/src/cloud-layer-roles.ts",
  "packages/scoring/src/engine.ts",
  "packages/weather/src/disagreement.ts",
] as const;

const forbiddenLocationConditionPatterns = [
  /includes\(\s*["'`]黄山/,
  /includes\(\s*["'`]光明顶/,
  /includes\(\s*["'`]玉京峰/,
  /includes\(\s*["'`]黄山光明顶/,
  /includes\(\s*["'`]黄山风景区/,
  /includes\(\s*["'`]瓯江/,
  /includes\(\s*["'`]平顶山/,
  /includes\(\s*["'`]柳树沟/,
  /includes\(\s*["'`]老君山/,
  /includes\(\s*["'`]三清山/,
  /includes\(\s*["'`]武功山/,
  /===\s*["'`]黄山/,
  /===\s*["'`]光明顶/,
  /===\s*["'`]玉京峰/,
  /===\s*["'`]黄山光明顶/,
  /===\s*["'`]黄山风景区/,
  /===\s*["'`]瓯江/,
  /===\s*["'`]平顶山/,
  /===\s*["'`]柳树沟/,
  /===\s*["'`]老君山/,
  /===\s*["'`]三清山/,
  /===\s*["'`]武功山/,
] as const;

describe("Cloud Sea rule files", () => {
  it("do not use hardcoded location names as judgment conditions", () => {
    const violations = cloudSeaRuleFiles.flatMap((file) => {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      return forbiddenLocationConditionPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });
});
