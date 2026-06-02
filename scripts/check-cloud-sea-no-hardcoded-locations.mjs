#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

export const cloudSeaProductionRuleFiles = [
  "apps/web/app/forecast/cloud-sea-rule-context.ts",
  "apps/web/app/forecast/cloud-sea-terrain-context.ts",
  "apps/web/app/forecast/forecast-result-view-model.ts",
  "packages/shared/src/cloud-sea-recommendation-guard.ts",
  "packages/shared/src/cloud-sea-weather-variable-consistency.ts",
  "packages/shared/src/cloud-sea-cloud-basis-consistency.ts",
  "packages/shared/src/cloud-layer-completeness.ts",
  "packages/scoring/src/cloud-sea-analysis.ts",
  "packages/scoring/src/cloud-layer-roles.ts",
  "packages/scoring/src/engine.ts",
  "packages/weather/src/cloud-layer-coverage-resolver.ts",
  "packages/weather/src/disagreement.ts",
  "packages/weather/src/fusion.ts",
  "packages/weather/src/open-meteo-forecast-cloud-layer-provider.ts",
  "packages/weather/src/open-meteo-icon-cloud-layer-provider.ts",
];

const forbiddenLocationNames = [
  "黄山",
  "光明顶",
  "玉京峰",
  "三清山",
  "瓯江",
  "老君山",
  "武功山",
  "平顶山",
];

const forbiddenNameGroup = forbiddenLocationNames.join("|");

const forbiddenConditionPatterns = [
  {
    label: "includes(real location name)",
    pattern: new RegExp(`\\bincludes\\(\\s*["'\`][^"'\`]*(?:${forbiddenNameGroup})`, "u"),
  },
  {
    label: "location name equality",
    pattern: new RegExp(
      `(?:locationName|spot\\.name|place\\.name|query\\.name|name)\\s*={2,3}\\s*["'\`][^"'\`]*(?:${forbiddenNameGroup})[^"'\`]*["'\`]`,
      "u",
    ),
  },
  {
    label: "reversed location name equality",
    pattern: new RegExp(
      `["'\`][^"'\`]*(?:${forbiddenNameGroup})[^"'\`]*["'\`]\\s*={2,3}\\s*(?:locationName|spot\\.name|place\\.name|query\\.name|name)`,
      "u",
    ),
  },
];

export function findCloudSeaHardcodedLocationViolations(root = repoRoot) {
  return cloudSeaProductionRuleFiles.flatMap((file) => {
    const absolutePath = resolve(root, file);
    const source = readFileSync(absolutePath, "utf8");
    return forbiddenConditionPatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ label, pattern }) => ({
        file: relative(root, absolutePath).replaceAll("\\", "/"),
        label,
        pattern: pattern.source,
      }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = findCloudSeaHardcodedLocationViolations();

  if (violations.length > 0) {
    console.error("Cloud Sea production rule/helper files contain location-name conditions:");
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.label} (${violation.pattern})`);
    }
    process.exitCode = 1;
  } else {
    console.log("Cloud Sea no-hardcoded-location guard passed.");
  }
}
