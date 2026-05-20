import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { glowScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "朝霞晚霞 - 逐光天气",
};

export default function GlowPage() {
  return <ScenarioModulePage config={glowScenarioConfig} />;
}
