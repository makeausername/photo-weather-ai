import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "../page";
import {
  astroScenarioConfig,
  cloudSeaScenarioConfig,
  glowScenarioConfig,
} from "../scenario-configs";
import { ScenarioModulePage } from "../../components/scenario-module-page";

const staticPublicSourceFiles = [
  "../page.tsx",
  "../scenario-configs.ts",
  "../../components/scenario-module-page.tsx",
] as const;

const forbiddenStaticLiveClaims = [
  /今晚可拍/,
  /今晚.*推荐.*出发/,
  /推荐今晚出发/,
  /今天适合拍云海/,
  /全国.*云海机会高/,
  /云海机会高.*全国/,
  /银河条件优秀/,
  /推荐今夜前往/,
] as const;

function readStaticPublicSource(): string {
  return staticPublicSourceFiles
    .map((path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"))
    .join("\n");
}

function renderScenarioEntryPages(): string {
  return [
    cloudSeaScenarioConfig,
    glowScenarioConfig,
    astroScenarioConfig,
  ]
    .map((config) => renderToStaticMarkup(React.createElement(ScenarioModulePage, { config })))
    .join("\n");
}

describe("whole-site static copy guard", () => {
  it("keeps homepage and scenario pages as capability copy, not live forecast claims", () => {
    const source = readStaticPublicSource();
    const rendered = [
      renderToStaticMarkup(React.createElement(HomePage)),
      renderScenarioEntryPages(),
    ].join("\n");

    expect(source).toContain("输入拍摄地点后，生成出行判断、最佳窗口、优先题材和主要风险。");
    expect(rendered).toContain("输入拍摄地点后，生成出行判断、最佳窗口、优先题材和主要风险。");
    expect(rendered).toContain("选择地点后");

    for (const forbiddenClaim of forbiddenStaticLiveClaims) {
      expect(source).not.toMatch(forbiddenClaim);
      expect(rendered).not.toMatch(forbiddenClaim);
    }
  });
});
