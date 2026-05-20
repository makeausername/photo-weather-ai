import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { astroScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "星空银河 - 逐光天气",
};

export default function AstroPage() {
  return <ScenarioModulePage config={astroScenarioConfig} />;
}
