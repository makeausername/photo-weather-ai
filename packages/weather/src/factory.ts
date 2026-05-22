import { MockWeatherProvider } from "./mock-provider.js";
import { OpenMeteoProvider } from "./open-meteo-provider.js";
import type { WeatherProvider } from "./provider.js";
import { QWeatherProvider } from "./qweather-provider.js";
import type { WeatherProviderCode, WeatherProviderMode } from "./types.js";

export type WeatherProviderFactoryOptions = {
  readonly provider?: WeatherProviderCode;
  readonly mode?: WeatherProviderMode;
  readonly nodeEnv?: string;
};

export function createWeatherProvider(
  options: WeatherProviderFactoryOptions = {},
): WeatherProvider {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const provider = options.provider ?? readProviderCode(process.env.WEATHER_PROVIDER);
  const mode = options.mode ?? readProviderMode(process.env.WEATHER_PROVIDER_MODE);

  if (nodeEnv === "test" && options.provider === undefined && options.mode === undefined) {
    return new MockWeatherProvider();
  }

  if (!provider || provider === "mock" || !mode || mode === "mock") {
    return new MockWeatherProvider();
  }

  if (mode === "real") {
    throw new Error(
      nodeEnv === "test"
        ? "Real weather provider calls are disabled in tests."
        : "Real weather provider calls are not implemented yet. Use WEATHER_PROVIDER_MODE=fixture for local adapter validation.",
    );
  }

  switch (provider) {
    case "qweather":
      return new QWeatherProvider();
    case "open_meteo":
      return new OpenMeteoProvider();
  }
}

function readProviderCode(value: string | undefined): WeatherProviderCode | undefined {
  if (value === "mock" || value === "qweather" || value === "open_meteo") {
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
