import type { Metadata } from "next";
import { ScenarioModulePage } from "../../components/scenario-module-page";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { ForecastResultClient } from "../forecast/forecast-result-client";
import { parseAccountHistoryForecastSearchParams } from "../forecast/account-history-deep-link";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";
import { astroScenarioConfig } from "../scenario-configs";

export const metadata: Metadata = {
  title: "星空银河 - 逐光天气",
};

type AstroPageProps = {
  readonly searchParams?: Record<string, string | readonly string[] | undefined>;
};

export default function AstroPage({ searchParams }: AstroPageProps) {
  const historyParsed = parseAccountHistoryForecastSearchParams("astro", searchParams ?? {});
  if (historyParsed.kind === "ready") {
    return (
      <ForecastResultClient
        query={historyParsed.query}
        invalidReason={historyParsed.invalidReason}
      />
    );
  }
  if (historyParsed.kind === "invalid") {
    return <ForecastResultClient query={null} invalidReason={historyParsed.message} />;
  }

  const parsed = parseSubjectDetailSearchParams("astro", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="astro" parsed={parsed} />;
  }

  return <ScenarioModulePage config={astroScenarioConfig} />;
}
