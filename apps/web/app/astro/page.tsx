import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";
import { astroScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "星空银河 - 逐光天气",
};

type AstroPageProps = {
  readonly searchParams?: Record<string, string | readonly string[] | undefined>;
};

export default function AstroPage({ searchParams }: AstroPageProps) {
  const parsed = parseSubjectDetailSearchParams("astro", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="astro" parsed={parsed} />;
  }

  return <ScenarioModulePage config={astroScenarioConfig} />;
}
