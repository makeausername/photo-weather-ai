import { defaultTimezone, formatZonedIso, getNowInTimezone } from "@photo-weather/calendar";
import type { WeatherProvider } from "./provider.js";
import type { WeatherDataBundle, WeatherRequestInput } from "./types.js";
import { createWeatherProvider, type WeatherProviderFactoryOptions } from "./factory.js";

export class WeatherDataService {
  constructor(private readonly provider: WeatherProvider = createWeatherProvider()) {}

  async getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle> {
    const [current, hourly, daily, alerts, airQuality] = await Promise.all([
      this.provider.getCurrentWeather(input),
      this.provider.getHourlyForecast(input),
      this.provider.getDailyForecast(input),
      this.provider.getWeatherAlerts(input),
      this.provider.getAirQuality(input),
    ]);

    return {
      current,
      hourly,
      daily,
      alerts,
      airQuality,
      providerCode: this.provider.source.providerCode,
      providerLabelZh: this.provider.source.providerLabelZh,
      dataMode: this.provider.source.mode,
      generatedAt:
        input.forecastStart ??
        current.observedAt ??
        formatZonedIso(
          getNowInTimezone(input.timezone ?? defaultTimezone),
          input.timezone ?? defaultTimezone,
        ),
      noticeZh: `天气数据：${this.provider.source.providerLabelZh}`,
    };
  }
}

export function createWeatherDataService(
  options: WeatherProviderFactoryOptions = {},
): WeatherDataService {
  return new WeatherDataService(createWeatherProvider(options));
}
