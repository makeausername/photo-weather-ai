import type { Metadata } from "next";
import { readPublicSiteConfig } from "../../lib/public-site-config";
import { FreeWeatherWorkbench } from "../../components/free-weather-workbench";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { ForecastResultClient } from "../forecast/forecast-result-client";
import { parseAccountHistoryForecastSearchParams } from "../forecast/account-history-deep-link";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `星空银河 - ${(await readPublicSiteConfig()).name}` };
}

type AstroPageProps = {
  readonly searchParams?: Promise<Record<string, string | readonly string[] | undefined>>;
};

export default async function AstroPage({ searchParams: pendingParams }: AstroPageProps) {
  const searchParams = await pendingParams;
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

  return <FreeWeatherWorkbench view="stars" />;
}
