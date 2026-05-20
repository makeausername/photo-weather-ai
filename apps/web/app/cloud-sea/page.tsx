import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { cloudSeaScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "云海判断 - 逐光天气",
};

export default function CloudSeaPage() {
  return <ScenarioModulePage config={cloudSeaScenarioConfig} />;
}
