import type { Metadata } from "next";
import { readPublicSiteConfig } from "../../lib/public-site-config";
import { FreeWeatherWorkbench } from "../../components/free-weather-workbench";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { ForecastResultClient } from "../forecast/forecast-result-client";
import { parseAccountHistoryForecastSearchParams } from "../forecast/account-history-deep-link";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `朝霞晚霞 - ${(await readPublicSiteConfig()).name}` };
}

type GlowPageProps = {
  readonly searchParams?: Promise<Record<string, string | readonly string[] | undefined>>;
};

export default async function GlowPage({ searchParams: pendingParams }: GlowPageProps) {
  const searchParams = await pendingParams;
  const historyParsed = parseAccountHistoryForecastSearchParams("glow", searchParams ?? {});
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

  const parsed = parseSubjectDetailSearchParams("glow", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="glow" parsed={parsed} />;
  }

  return <FreeWeatherWorkbench view="sun" />;
}
