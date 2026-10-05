# Real Forecast Data Pipeline V1

Real Forecast Data Pipeline V1 connects the public `/forecast` calculation path to configured production providers. The page can still run in demo mode, but demo data is never presented as real data.

## Runtime Flow

1. Public pages call `POST /forecast/calculate` with the selected place, WGS84 coordinates, GCJ-02 coordinates, horizon, target, and optional elevation.
2. The API reads enabled provider configuration from `/admin/providers`.
3. Enabled real weather providers are fetched through backend-only adapters.
4. Provider responses are normalized into current, hourly, and daily weather structures.
5. `WeatherIntelligenceService` fuses available real sources and records source summaries, missing fields, conflict flags, and confidence.
6. `packages/scoring` consumes only normalized weather, terrain, and astronomy data. It does not read raw provider JSON.
7. Result pages display the computed values, source labels, provider warnings, confidence, and deterministic clothing guide.

## Source Responsibilities

- Amap / 高德地图: location search, geocoding, coordinate source, and GCJ-02/WGS84 handling.
- QWeather / 和风天气: primary China weather source for current weather, hourly forecast, daily forecast, alerts, air quality, visibility, weather text/code, wind, humidity, and temperature.
- Open-Meteo: auxiliary cloud and atmosphere source for total/low/mid/high cloud, visibility, dew point, humidity, pressure, wind, gusts, precipitation, and precipitation probability.
- meteoblue: professional enhancement source. When enabled, configured, and `realCallEnabled`, it fetches Forecast API packages such as `basic-1h,clouds-1h` and enriches cloud/weather confidence. Failure lowers confidence but does not break the forecast.
- Astro Service: deterministic local astronomy for sunrise/sunset, twilight, moon phase, moonrise/moonset, illumination, astronomical night, Milky Way windows, and no-moon dark windows.

## Data Status Labels

Weather data status is explicit:

- `天气数据：和风天气`
- `云层辅助：Open-Meteo`
- `专业增强：meteoblue`
- `天气数据：演示数据`
- `天气数据：真实数据暂不可用，已回退到演示数据`

Provider failures are recorded in `weatherSourceSummaries` and surfaced as compact warnings, for example:

- `Open-Meteo 暂时不可用，结果已降低置信度。`
- `高德地图暂时不可用，已使用本地机位坐标。`

If all real weather providers fail, the API returns deterministic demo/local weather with `dataMode=fallback` and the fallback status label above. It does not silently mark fallback data as real.

## Normalized Weather Model

The shared contract now includes:

- `NormalizedCurrentWeather`
- `NormalizedHourlyWeather`
- `NormalizedDailyWeather`
- `WeatherFusionSummary`
- `ForecastWeatherSourceSummary`
- `ClothingGuide`

The current weather structure carries provider code, Chinese source label, data mode, observed time, temperature, feels-like temperature, humidity, dew point, dew point spread, wind, gusts, pressure, visibility, cloud layers, precipitation, weather text/code, air quality, missing fields, and estimated fields.

## Provider Configuration

Configure providers in `/admin/providers`:

- QWeather: save API Host and API Key. Requests use `X-QW-Api-Key` from the backend only.
- Open-Meteo: use free mode with `https://api.open-meteo.com`, or customer mode with customer endpoint and key.
- meteoblue: save API Key, Base URL, and packages. Defaults are `https://my.meteoblue.com` and `basic-1h,clouds-1h`.

Automated tests mock providers and must not call real external APIs.

## Clothing Guide

The clothing guide is deterministic and rule-based. It uses temperature, feels-like temperature, wind speed, gusts, precipitation probability, humidity, elevation, target, and forecast window.

Examples:

- 10-15°C mountain morning: soft shell, light down or fleece, middle insulation, windproof outer layer.
- 0-10°C mountain night astro: down jacket, fleece, hat, gloves, and long-wait warmth notes.
- Rain or wind: waterproof shell, anti-slip shoes, and spare dry layer.
- High humidity cloud sea: damp protection, anti-slip shoes, and lens cloth.
- Summer heat: light quick-dry clothes, sun protection, and hydration.

## Cache And Cost Control

### Coherent mountain and cloud evidence

- At viewpoints of 800 m or higher, hourly temperature, humidity and dew point prefer a source whose reported elevation is within 150 m of the selected viewpoint. These fields and their elevation metadata move together. A source already downscaled to the viewpoint must not receive a second mountain cooling correction.
- Temperature disagreement compares matching elevations when available. Unmatched/unknown-elevation source differences remain recorded in the professional summary, instead of being treated as competing forecasts for the same mountain air mass. Genuine disagreement between matching sources still lowers confidence.
- Total, low, middle and high cloud cover use the same complete-source cohort and median strategy. A source supplying only total cloud does not distort the total of another source's layer column. Partial ICON data yields to a complete fallback column, with the fallback's provenance.
- Do not clamp provider-native cloud fields merely to force total cover above each layer. Providers can use different layer definitions; retain evidence review where the returned column still disagrees. See [Open-Meteo variable definitions](https://open-meteo.com/en/docs) and [meteoblue weather variables](https://docs.meteoblue.com/en/meteo/variables/weather-variables).
- A cautious trip decision does not suppress available hourly evidence. Morning mist, low clouds and sunrise can remain assessable while a dedicated trip or its score stays uncertain.

### Slow forecast requests

The web client sends `Prefer: respond-async` to `POST /forecast/calculate`. If work is still running after five seconds, the API returns HTTP 202 with `{ "status": "processing", "retryAfterMs": 1000 }`, `Retry-After: 1` and `Cache-Control: no-store`. Repost the identical authorized query to join the same in-flight work; the finished response is HTTP 200 with the normal forecast result. Pending payloads are never cached as forecasts. Cancellation, entitlement checks and transient-error handling remain active, and frontend polling is bounded to 90 seconds.

Clients without this preference retain the synchronous response contract. Deploy web and API together using `scripts/update.sh`; frontend forecast cache version 6 discards previous result records. `FORECAST_CALCULATE_RESPONSE_WAIT_MS` may shorten the server response wait, but is capped at five seconds. This avoids holding the web request open during slow provider/astro work; it does not claim to fix every possible upstream 502.

The pipeline uses the existing in-memory weather cache in `WeatherIntelligenceService` and provider cache keys. Cache keys include provider, coordinate bucket, horizon, forecast time bucket, target, and data type where available. Current weather uses a shorter TTL, while forecast data can be reused longer.

Future production hardening should persist cache entries across API restarts and add quota/cost dashboards. Provider test connections remain separate from user forecast caching.

## Server Test

Run a safe public forecast smoke test:

```bash
bash scripts/test-real-weather.sh
```

Optional overrides:

```bash
PHOTO_WEATHER_API_BASE_URL=https://your-domain/api bash scripts/test-real-weather.sh
FORECAST_TARGET=cloud_sea FORECAST_HORIZON=48h bash scripts/test-real-weather.sh
```

The script posts a 黄山光明顶 forecast request and prints `dataStatusZh`, source summaries, temperature, cloud fields, clothing guide, and confidence. It does not print API keys.
