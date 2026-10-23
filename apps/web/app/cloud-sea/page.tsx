import type { Metadata } from "next";
import { readPublicSiteConfig } from "../../lib/public-site-config";
import { FreeWeatherWorkbench } from "../../components/free-weather-workbench";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { ForecastResultClient } from "../forecast/forecast-result-client";
import { parseAccountHistoryForecastSearchParams } from "../forecast/account-history-deep-link";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `云海判断 - ${(await readPublicSiteConfig()).name}` };
}

type CloudSeaPageProps = {
  readonly searchParams?: Promise<Record<string, string | readonly string[] | undefined>>;
};

export default async function CloudSeaPage({ searchParams: pendingParams }: CloudSeaPageProps) {
  const searchParams = await pendingParams;
  const historyParsed = parseAccountHistoryForecastSearchParams("cloud_sea", searchParams ?? {});
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

  const parsed = parseSubjectDetailSearchParams("cloud_sea", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="cloud_sea" parsed={parsed} />;
  }

  return <FreeWeatherWorkbench view="map" />;
}
