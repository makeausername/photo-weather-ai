import { MockWeatherProvider } from "./mock-provider.js";
import {
  MeteoblueClient,
  MeteoblueProvider,
  MeteoblueRealProvider,
  type MeteoblueClientOptions,
} from "./meteoblue-provider.js";
import { OpenMeteoClient, type OpenMeteoClientOptions } from "./open-meteo-client.js";
import { OpenMeteoProvider, OpenMeteoRealProvider } from "./open-meteo-provider.js";
import type { WeatherProvider } from "./provider.js";
import { QWeatherClient, type QWeatherClientOptions } from "./qweather-client.js";
import { QWeatherProvider } from "./qweather-provider.js";
import { QWeatherRealProvider } from "./qweather-real-provider.js";
import type { WeatherProviderCode, WeatherProviderMode } from "./types.js";

export type WeatherProviderFactoryOptions = {
  readonly provider?: WeatherProviderCode;
  readonly mode?: WeatherProviderMode;
  readonly nodeEnv?: string;
  readonly qweather?: QWeatherClientOptions;
  readonly openMeteo?: OpenMeteoClientOptions;
  readonly meteoblue?: MeteoblueClientOptions;
};

export function createWeatherProvider(
  options: WeatherProviderFactoryOptions = {},
): WeatherProvider {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const provider = options.provider ?? readProviderCode(process.env.WEATHER_PROVIDER);
  const mode = options.mode ?? readProviderMode(process.env.WEATHER_PROVIDER_MODE);

  if (!provider || !mode) {
    if (nodeEnv === "test" && options.provider === undefined && options.mode === undefined) {
      return new MockWeatherProvider();
    }
    throw new Error(
      "Weather provider configuration is missing; forecast generation must report insufficient evidence.",
    );
  }

  if (provider === "mock" || mode === "mock") {
    if (nodeEnv === "production") {
      throw new Error("Mock weather providers are forbidden in production.");
    }
    return new MockWeatherProvider();
  }

  if (mode === "real") {
    if (nodeEnv === "test") {
      throw new Error("Real weather provider calls are disabled in tests.");
    }

    if (provider === "qweather" && options.qweather) {
      return new QWeatherRealProvider({
        client: new QWeatherClient(options.qweather),
        unit: options.qweather.unit,
      });
    }

    if (provider === "open_meteo" && options.openMeteo) {
      return new OpenMeteoRealProvider({
        client: new OpenMeteoClient(options.openMeteo),
      });
    }

    if (provider === "meteoblue" && options.meteoblue) {
      return new MeteoblueRealProvider({
        client: new MeteoblueClient(options.meteoblue),
        timezone: "Asia/Shanghai",
      });
    }

    throw new Error(
      "Real weather provider calls require explicit runtime provider credentials. Use fixture mode for local adapter validation.",
    );
  }

  switch (provider) {
    case "qweather":
      return new QWeatherProvider();
    case "open_meteo":
      return new OpenMeteoProvider();
    case "meteoblue":
      return new MeteoblueProvider();
    case "unavailable":
      throw new Error("Unavailable weather is a data state, not a provider implementation.");
  }
}

function readProviderCode(value: string | undefined): WeatherProviderCode | undefined {
  if (value === "mock" || value === "qweather" || value === "open_meteo" || value === "meteoblue") {
    return value;
  }

  return undefined;
}

function readProviderMode(value: string | undefined): WeatherProviderMode | undefined {
  if (value === "mock" || value === "fixture" || value === "real") {
    return value;
  }

  return undefined;
}
