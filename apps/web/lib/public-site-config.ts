import { defaultPublicSiteConfig, type PublicSiteConfig } from "@photo-weather/shared";

export async function readPublicSiteConfig(): Promise<PublicSiteConfig> {
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:4000"}/site/config`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return defaultPublicSiteConfig;
    return await response.json() as PublicSiteConfig;
  } catch { return defaultPublicSiteConfig; }
}
