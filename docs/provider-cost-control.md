# Provider cost control

逐光天气可以使用付费 API，但付费 API 必须有明确价值、明确开关、明确缓存、明确配额和明确成本记录。任何 provider 接入都不能默认无限制调用。

## Principles

- Paid APIs are acceptable only where they materially improve accuracy, reliability, or coverage.
- Free/open/local data is used first when accurate enough.
- Local development and automated tests use mock / fixture / local deterministic data by default.
- Real calls must be opt-in through admin/provider configuration.
- Every paid request should be attributable to provider, module, user or system job, place, horizon and generatedAt bucket.

## Cache strategy

Cache keys should include:

- place or normalized WGS84 coordinate bucket。
- horizon。
- provider。
- generatedAt bucket。
- forecast model or endpoint version if relevant。
- data type：current, hourly, daily, alerts, air quality, elevation, light pollution。

Rules:

- Cache by place + horizon + provider + generatedAt bucket.
- Deduplicate same place/time requests.
- Avoid repeated provider calls for same forecast window.
- Store provider update time and local fetch time separately.
- Reuse cached weather facts for deterministic summaries and result displays.

## Prefetch strategy

- Prefetch hot spots only.
- Hot spots should be defined by admin operation, recent query volume, saved favorites, or editorial priority.
- Do not prefetch long-tail locations by default.
- Prefetch windows should match product horizons, not arbitrary provider windows.
- Stop prefetch automatically when provider quota or cost threshold is close to limit.

## Weather provider controls

- QWeather/Open-Meteo rate limits must be enforced at service level.
- Use QWeather for China main weather coverage when it improves reliability.
- Use Open-Meteo for cloud layers, visibility, dew point and multi-model assistance where allowed.
- Do not call both providers for every request unless conflict detection or paid-tier value justifies it.
- Prefer cached popular spot results.
- Log cache hits, misses, provider errors, quota warnings and estimated cost.

## Terrain and light pollution controls

- Prefer local cached DEM for scale and cost control.
- Precompute terrain profiles for verified hot spots.
- Use public light pollution datasets locally where possible.
- Do not call expensive elevation or light pollution API per forecast request unless justified.
- Include data year, resolution and confidence in stored metadata.

## User quota and plan controls

- Separate free users and paid users later.
- Per-user quota later.
- Quotas should count paid-provider forecast calls separately from saved-report and export actions.
- Saved reports should reuse existing fetched data when possible.
- Admins need emergency provider disable switches.

## Admin cost dashboard later

The admin dashboard should eventually show:

- Provider request counts.
- Estimated provider cost.
- Cache hit rate.
- Cost per module.
- Cost per user tier.
- Top queried spots.
- Failed calls and fallback rate.
- Quota warning events.
- Manual provider disable/enable history.

## Fallback policy

When cost controls prevent a paid call:

- Use cached data if still within an acceptable freshness window.
- Use free/open/local fallback if available.
- Display lower confidence instead of inventing precision.
- Keep deterministic scoring available when enough fields remain.
- Disable paid-provider calls when deterministic results are incomplete or cost quota is exhausted.
