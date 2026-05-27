import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";
import { cloudSeaScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "云海判断 - 逐光天气",
};

type CloudSeaPageProps = {
  readonly searchParams?: Record<string, string | readonly string[] | undefined>;
};

export default function CloudSeaPage({ searchParams }: CloudSeaPageProps) {
  const parsed = parseSubjectDetailSearchParams("cloud_sea", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="cloud_sea" parsed={parsed} />;
  }

  return <ScenarioModulePage config={cloudSeaScenarioConfig} />;
}
