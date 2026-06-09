import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";
import { glowScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "朝霞晚霞 - 逐光天气",
};

type GlowPageProps = {
  readonly searchParams?: Record<string, string | readonly string[] | undefined>;
};

export default function GlowPage({ searchParams }: GlowPageProps) {
  const parsed = parseSubjectDetailSearchParams("glow", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="glow" parsed={parsed} />;
  }

  return <ScenarioModulePage config={glowScenarioConfig} />;
}
