import type { ElevationProvider, ElevationProviderResult } from "./elevation-service.js";
import type { TerrainAnalysisInput } from "./types.js";

type OpenMeteoElevationFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenMeteoElevationProviderConfig = {
  readonly enabled?: boolean;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: OpenMeteoElevationFetch;
};

type OpenMeteoElevationResponse = {
  readonly elevation?: readonly unknown[] | unknown;
};

const defaultEndpoint = "https://api.open-meteo.com/v1/elevation";
const defaultTimeoutMs = 4500;

export class OpenMeteoElevationProvider implements ElevationProvider {
  private readonly fetcher: OpenMeteoElevationFetch;
  private readonly enabled: boolean;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(config: OpenMeteoElevationProviderConfig = {}) {
    this.fetcher = config.fetcher ?? fetch;
    this.enabled = config.enabled ?? true;
    this.endpoint = config.endpoint ?? defaultEndpoint;
    this.timeoutMs = Math.max(1000, Math.round(config.timeoutMs ?? defaultTimeoutMs));
  }

  async getElevationForLocation(input: TerrainAnalysisInput): Promise<ElevationProviderResult> {
    if (!this.enabled) {
      return unknownElevation();
    }

    const latitude = input.coordinate.latitude;
    const longitude = input.coordinate.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return unknownElevation();
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        return unknownElevation();
      }

      const data = (await response.json()) as OpenMeteoElevationResponse;
      const elevation = parseOpenMeteoElevation(data);
      if (elevation === null) {
        return unknownElevation();
      }

      return {
        elevationMeters: elevation,
        elevationSource: "open_meteo_elevation",
        elevationConfidence: "medium",
      };
    } catch {
      return unknownElevation();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseOpenMeteoElevation(data: OpenMeteoElevationResponse): number | null {
  const raw = Array.isArray(data.elevation) ? data.elevation[0] : data.elevation;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;

  return Number.isFinite(value) ? Math.round(value) : null;
}

function unknownElevation(): ElevationProviderResult {
  return {
    elevationMeters: null,
    elevationSource: "unknown",
    elevationConfidence: "low",
  };
}
