import type {
  ElevationConfidence,
  ElevationSource,
  ForecastCalculationResult,
  ForecastHorizon,
  ForecastQueryInput,
  ForecastTarget,
} from "@photo-weather/shared";
import { formatShootingWindowZh } from "@photo-weather/shared";

export type SubjectDetailTarget = Extract<ForecastTarget, "cloud_sea" | "glow" | "astro">;

export type SubjectDetailSubject =
  | "cloud_sea"
  | "sunrise_glow"
  | "sunset_glow"
  | "afterglow"
  | "astro"
  | "milky_way";

export type SubjectDetailLocation = {
  readonly locationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly latGcj02?: number;
  readonly lngGcj02?: number;
  readonly elevation?: number | null;
  readonly locationSource?: string;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

export type SubjectDetailDeepLinkContext = {
  readonly resultId?: string;
  readonly reportId?: string;
  readonly target: SubjectDetailTarget;
  readonly subject?: SubjectDetailSubject;
  readonly date: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly source: "general";
  readonly timezone?: string;
  readonly horizon?: ForecastHorizon;
  readonly returnUrl?: string;
  readonly location?: SubjectDetailLocation;
};

export type SubjectDetailDeepLinkParseResult =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "ready";
      readonly context: SubjectDetailDeepLinkContext;
      readonly fallbackQuery: ForecastQueryInput | null;
      readonly requestOptions: SubjectDetailRequestOptions;
    }
  | {
      readonly kind: "invalid";
      readonly context?: Partial<SubjectDetailDeepLinkContext>;
      readonly message: string;
    };

export type SubjectDetailRequestOptions = {
  readonly timezone?: string;
  readonly startDateTime?: string;
};

export type StoredForecastResultContext = {
  readonly version: 1;
  readonly resultId: string;
  readonly createdAt: number;
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
};

export type GeneralDailySubjectLink = {
  readonly target: SubjectDetailTarget;
  readonly label: string;
  readonly href: string;
};

const resultContextStoragePrefix = "photo_weather_forecast_result_context:v1:";
const resultContextTtlMs = 1000 * 60 * 60;

const forecastHorizons = new Set<ForecastHorizon>(["24h", "48h", "72h", "7d"]);
const subjectTargets = new Set<SubjectDetailTarget>(["cloud_sea", "glow", "astro"]);
const subjectValues = new Set<SubjectDetailSubject>([
  "cloud_sea",
  "sunrise_glow",
  "sunset_glow",
  "afterglow",
  "astro",
  "milky_way",
]);

const deepLinkParamKeys = [
  "resultId",
  "reportId",
  "target",
  "subject",
  "date",
  "windowStart",
  "windowEnd",
  "locationName",
  "lat",
  "lng",
  "latWgs84",
  "lngWgs84",
  "elevation",
  "elevationMeters",
  "timezone",
  "horizon",
  "source",
  "returnUrl",
] as const;

export function buildGeneralDailySubjectLinks({
  query,
  result,
  date,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly date: string;
}): readonly GeneralDailySubjectLink[] {
  const resultId = createForecastResultContextId(query, result);
  const returnUrl = buildGeneralForecastReturnUrl(query);
  const items: GeneralDailySubjectLink[] = [];

  const cloudSeaWindow = bestDailySubjectWindow(result, date, "cloud_sea");
  if (hasSubjectDataForDate(result, date, "cloud_sea")) {
    items.push({
      target: "cloud_sea",
      label: "查看云海详情",
      href: buildSubjectDetailDeepLink({
        query,
        result,
        resultId,
        target: "cloud_sea",
        subject: "cloud_sea",
        date,
        window: cloudSeaWindow,
        returnUrl,
      }),
    });
  }

  const glowWindow = bestDailySubjectWindow(result, date, "glow");
  if (hasSubjectDataForDate(result, date, "glow")) {
    items.push({
      target: "glow",
      label: "查看霞光详情",
      href: buildSubjectDetailDeepLink({
        query,
        result,
        resultId,
        target: "glow",
        subject: glowWindow ? subjectForForecastWindow(glowWindow) : "sunset_glow",
        date,
        window: glowWindow,
        returnUrl,
      }),
    });
  }

  const astroWindow = bestDailySubjectWindow(result, date, "astro");
  if (hasSubjectDataForDate(result, date, "astro")) {
    items.push({
      target: "astro",
      label: "查看星空详情",
      href: buildSubjectDetailDeepLink({
        query,
        result,
        resultId,
        target: "astro",
        subject: astroWindow ? subjectForForecastWindow(astroWindow) : "astro",
        date,
        window: astroWindow,
        returnUrl,
      }),
    });
  }

  return items;
}

export function buildSubjectDetailDeepLink({
  query,
  result,
  resultId,
  reportId,
  target,
  subject,
  date,
  window,
  windowStart,
  windowEnd,
  returnUrl,
}: {
  readonly query: ForecastQueryInput;
  readonly result?: ForecastCalculationResult;
  readonly resultId?: string;
  readonly reportId?: string;
  readonly target: SubjectDetailTarget;
  readonly subject?: SubjectDetailSubject;
  readonly date: string;
  readonly window?: ForecastCalculationResult["bestWindows"][number];
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly returnUrl?: string;
}): string {
  const context: SubjectDetailDeepLinkContext = {
    resultId,
    reportId,
    target,
    subject,
    date,
    windowStart: window?.startTime ?? windowStart,
    windowEnd: window?.endTime ?? windowEnd,
    source: "general",
    timezone: result?.calendarBasis.timezone ?? "Asia/Shanghai",
    horizon: query.horizon,
    returnUrl,
    location: locationFromForecastContext(query, result),
  };

  return buildSubjectDetailDeepLinkFromContext(context);
}

export function buildSubjectDetailDeepLinkFromContext(
  context: SubjectDetailDeepLinkContext,
): string {
  const params = new URLSearchParams({
    target: context.target,
    date: context.date,
    source: "general",
  });

  setOptionalParam(params, "resultId", context.resultId);
  setOptionalParam(params, "reportId", context.reportId);
  setOptionalParam(params, "subject", context.subject);
  setOptionalParam(params, "windowStart", context.windowStart);
  setOptionalParam(params, "windowEnd", context.windowEnd);
  setOptionalParam(params, "timezone", context.timezone);
  setOptionalParam(params, "horizon", context.horizon);
  setOptionalParam(params, "returnUrl", context.returnUrl);

  if (context.location) {
    const location = context.location;
    params.set("locationName", location.locationName);
    params.set("lat", String(location.lat));
    params.set("lng", String(location.lng));
    params.set("latWgs84", String(location.lat));
    params.set("lngWgs84", String(location.lng));
    if (typeof location.latGcj02 === "number" && Number.isFinite(location.latGcj02)) {
      params.set("latGcj02", String(location.latGcj02));
    }
    if (typeof location.lngGcj02 === "number" && Number.isFinite(location.lngGcj02)) {
      params.set("lngGcj02", String(location.lngGcj02));
    }
    if (typeof location.elevation === "number" && Number.isFinite(location.elevation)) {
      params.set("elevation", String(location.elevation));
      params.set("elevationMeters", String(location.elevation));
    }
    setOptionalParam(params, "locationSource", location.locationSource);
    setOptionalParam(params, "elevationSource", location.elevationSource);
    setOptionalParam(params, "elevationConfidence", location.elevationConfidence);
    setOptionalParam(params, "locationId", location.locationId);
    setOptionalParam(params, "photoSpotId", location.photoSpotId);
  }

  return `${pathForSubjectTarget(context.target)}?${params.toString()}`;
}

export function parseSubjectDetailSearchParams(
  expectedTarget: SubjectDetailTarget,
  searchParams: Record<string, string | readonly string[] | undefined> | undefined,
): SubjectDetailDeepLinkParseResult {
  if (!hasSubjectDetailParams(searchParams)) {
    return { kind: "empty" };
  }

  const targetParam = normalizeSubjectTarget(firstParam(searchParams?.target)) ?? expectedTarget;
  const date = firstParam(searchParams?.date);
  const source = firstParam(searchParams?.source);

  if (targetParam !== expectedTarget || source !== "general" || !isValidDateString(date)) {
    return {
      kind: "invalid",
      message: incompleteContextMessage,
    };
  }

  const subject = normalizeSubject(firstParam(searchParams?.subject));
  const horizon = normalizeForecastHorizon(firstParam(searchParams?.horizon));
  const context: SubjectDetailDeepLinkContext = {
    resultId: cleanString(firstParam(searchParams?.resultId)),
    reportId: cleanString(firstParam(searchParams?.reportId)),
    target: targetParam,
    subject,
    date,
    windowStart: cleanString(firstParam(searchParams?.windowStart)),
    windowEnd: cleanString(firstParam(searchParams?.windowEnd)),
    source: "general",
    timezone: cleanString(firstParam(searchParams?.timezone)),
    horizon,
    returnUrl: safeReturnUrl(firstParam(searchParams?.returnUrl)),
    location: parseLocationFromSearchParams(searchParams),
  };
  const fallbackQuery = buildFallbackForecastQuery(context);
  const requestOptions = buildSubjectDetailRequestOptions(context);

  if (!context.resultId && !context.reportId && !fallbackQuery) {
    return {
      kind: "invalid",
      context,
      message: incompleteContextMessage,
    };
  }

  return {
    kind: "ready",
    context,
    fallbackQuery,
    requestOptions,
  };
}

export function createForecastResultContextId(
  query: ForecastQueryInput,
  result: ForecastCalculationResult,
): string {
  const value = JSON.stringify({
    name: query.name,
    source: query.source,
    latitudeWgs84: query.latitudeWgs84,
    longitudeWgs84: query.longitudeWgs84,
    elevationMeters: query.elevationMeters ?? null,
    horizon: query.horizon,
    target: query.target,
    forecastStart: result.forecastStart,
    forecastEnd: result.forecastEnd,
    generatedAt: result.generatedAt,
  });

  return `fr_${stableHash(value)}`;
}

export function writeForecastResultContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}): string | null {
  const storage = browserSessionStorage();
  if (!storage) {
    return null;
  }

  const resultId = createForecastResultContextId(query, result);
  const record: StoredForecastResultContext = {
    version: 1,
    resultId,
    createdAt: Date.now(),
    query,
    result,
  };

  try {
    storage.setItem(`${resultContextStoragePrefix}${resultId}`, JSON.stringify(record));
    return resultId;
  } catch {
    return null;
  }
}

export function readForecastResultContext(
  resultId: string | undefined,
): StoredForecastResultContext | null {
  if (!resultId) {
    return null;
  }

  const storage = browserSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(`${resultContextStoragePrefix}${resultId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredForecastResultContext>;
    if (
      parsed.version !== 1 ||
      parsed.resultId !== resultId ||
      typeof parsed.createdAt !== "number" ||
      !parsed.query ||
      !parsed.result
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > resultContextTtlMs) {
      storage.removeItem(`${resultContextStoragePrefix}${resultId}`);
      return null;
    }
    return parsed as StoredForecastResultContext;
  } catch {
    return null;
  }
}

export function buildFallbackForecastQuery(
  context: SubjectDetailDeepLinkContext,
): ForecastQueryInput | null {
  const location = context.location;
  if (!location || !context.horizon) {
    return null;
  }

  if (
    !Number.isFinite(location.lat) ||
    location.lat < -90 ||
    location.lat > 90 ||
    !Number.isFinite(location.lng) ||
    location.lng < -180 ||
    location.lng > 180
  ) {
    return null;
  }

  return {
    name: location.locationName,
    source: location.locationSource ?? "manual",
    latitudeGcj02: location.latGcj02 ?? location.lat,
    longitudeGcj02: location.lngGcj02 ?? location.lng,
    latitudeWgs84: location.lat,
    longitudeWgs84: location.lng,
    horizon: context.horizon,
    target: context.target,
    elevationMeters:
      typeof location.elevation === "number" && Number.isFinite(location.elevation)
        ? location.elevation
        : null,
    elevationSource: location.elevationSource,
    elevationConfidence: location.elevationConfidence,
    locationId: location.locationId,
    photoSpotId: location.photoSpotId,
  };
}

export function buildSubjectDetailRequestOptions(
  context: SubjectDetailDeepLinkContext,
): SubjectDetailRequestOptions {
  return {
    timezone: context.timezone,
    startDateTime: startDateTimeForSubjectContext(context),
  };
}

export function formatSubjectDetailWindowLabel(context: SubjectDetailDeepLinkContext): string {
  if (context.windowStart && context.windowEnd) {
    return formatShootingWindowZh(
      { startTime: context.windowStart, endTime: context.windowEnd },
      context.timezone ?? "Asia/Shanghai",
    );
  }

  return "暂无高确定性窗口";
}

export function safeReturnUrl(value: string | undefined): string | undefined {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return undefined;
  }

  return cleaned.startsWith("/") && !cleaned.startsWith("//") ? cleaned : undefined;
}

export const incompleteContextMessage = "未找到完整的综合判断上下文，请重新选择地点。";

function locationFromForecastContext(
  query: ForecastQueryInput,
  result: ForecastCalculationResult | undefined,
): SubjectDetailLocation {
  return {
    locationName: result?.place.name ?? query.name,
    lat: query.latitudeWgs84,
    lng: query.longitudeWgs84,
    latGcj02: query.latitudeGcj02,
    lngGcj02: query.longitudeGcj02,
    elevation: query.elevationMeters,
    locationSource: query.source,
    elevationSource: query.elevationSource,
    elevationConfidence: query.elevationConfidence,
    locationId: query.locationId,
    photoSpotId: query.photoSpotId,
  };
}

function buildGeneralForecastReturnUrl(query: ForecastQueryInput): string {
  const params = new URLSearchParams({
    name: query.name,
    source: query.source,
    lat: String(query.latitudeGcj02),
    lng: String(query.longitudeGcj02),
    latGcj02: String(query.latitudeGcj02),
    lngGcj02: String(query.longitudeGcj02),
    latWgs84: String(query.latitudeWgs84),
    lngWgs84: String(query.longitudeWgs84),
    latitudeWgs84: String(query.latitudeWgs84),
    longitudeWgs84: String(query.longitudeWgs84),
    horizon: query.horizon,
    target: "general",
  });

  if (typeof query.elevationMeters === "number" && Number.isFinite(query.elevationMeters)) {
    params.set("elevationMeters", String(query.elevationMeters));
  }
  setOptionalParam(params, "elevationSource", query.elevationSource);
  setOptionalParam(params, "elevationConfidence", query.elevationConfidence);
  setOptionalParam(params, "locationId", query.locationId);
  setOptionalParam(params, "photoSpotId", query.photoSpotId);

  return `/forecast?${params.toString()}`;
}

function pathForSubjectTarget(target: SubjectDetailTarget): string {
  if (target === "cloud_sea") {
    return "/cloud-sea";
  }
  if (target === "glow") {
    return "/glow";
  }
  return "/astro";
}

function hasSubjectDetailParams(
  searchParams: Record<string, string | readonly string[] | undefined> | undefined,
): boolean {
  if (!searchParams) {
    return false;
  }

  return deepLinkParamKeys.some((key) => firstParam(searchParams[key]) !== undefined);
}

function parseLocationFromSearchParams(
  searchParams: Record<string, string | readonly string[] | undefined> | undefined,
): SubjectDetailLocation | undefined {
  const locationName = cleanString(firstParam(searchParams?.locationName));
  const lat = parseOptionalNumber(
    firstParam(searchParams?.latWgs84) ??
      firstParam(searchParams?.latitudeWgs84) ??
      firstParam(searchParams?.lat),
  );
  const lng = parseOptionalNumber(
    firstParam(searchParams?.lngWgs84) ??
      firstParam(searchParams?.longitudeWgs84) ??
      firstParam(searchParams?.lng),
  );

  if (!locationName || lat === undefined || lng === undefined) {
    return undefined;
  }

  return {
    locationName,
    lat,
    lng,
    latGcj02: parseOptionalNumber(firstParam(searchParams?.latGcj02)),
    lngGcj02: parseOptionalNumber(firstParam(searchParams?.lngGcj02)),
    elevation: parseOptionalNumber(
      firstParam(searchParams?.elevation) ?? firstParam(searchParams?.elevationMeters),
    ),
    locationSource: cleanString(firstParam(searchParams?.locationSource)),
    elevationSource: normalizeElevationSource(firstParam(searchParams?.elevationSource)),
    elevationConfidence: normalizeElevationConfidence(firstParam(searchParams?.elevationConfidence)),
    locationId: cleanString(firstParam(searchParams?.locationId)),
    photoSpotId: cleanString(firstParam(searchParams?.photoSpotId)),
  };
}

function bestDailySubjectWindow(
  result: ForecastCalculationResult,
  date: string,
  target: SubjectDetailTarget,
): ForecastCalculationResult["bestWindows"][number] | undefined {
  const windows = result.bestWindows
    .filter((window) => window.target === target && windowBelongsToDate(window, date))
    .sort(
      (left, right) =>
        windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
        (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
        Date.parse(left.startTime) - Date.parse(right.startTime),
    );
  const preferredAstroWindow =
    target === "astro"
      ? windows.find(
          (window) =>
            `${window.subjectPriorityLabel ?? ""} ${window.label}`.includes("银河") &&
            window.windowLevel !== "blocked",
        )
      : undefined;
  const usable = windows.find((window) => window.windowLevel !== "blocked");

  return preferredAstroWindow ?? usable ?? windows[0];
}

function hasSubjectDataForDate(
  result: ForecastCalculationResult,
  date: string,
  target: SubjectDetailTarget,
): boolean {
  if (result.bestWindows.some((window) => window.target === target && windowBelongsToDate(window, date))) {
    return true;
  }

  if (target === "cloud_sea") {
    return result.cloudSeaAnalysis.dailyCloudSea.some((day) => day.date === date);
  }
  if (target === "glow") {
    return result.glowAnalysis.dailyGlow.some((day) => day.date === date);
  }
  return result.astroAnalysis.dailyAstro.some((day) => day.date === date);
}

function subjectForForecastWindow(
  window: ForecastCalculationResult["bestWindows"][number],
): SubjectDetailSubject {
  if (window.target === "cloud_sea") {
    return "cloud_sea";
  }
  const subjectText = `${window.subjectPriorityLabel ?? ""} ${window.label}`;
  if (window.target === "astro") {
    return subjectText.includes("银河") ? "milky_way" : "astro";
  }
  if (subjectText.includes("余晖")) {
    return "afterglow";
  }
  if (isMorningWindow(window)) {
    return "sunrise_glow";
  }
  return "sunset_glow";
}

function windowBelongsToDate(
  window: ForecastCalculationResult["bestWindows"][number],
  date: string,
): boolean {
  return (
    window.date === date ||
    window.startTime.startsWith(`${date}T`) ||
    window.endTime.startsWith(`${date}T`)
  );
}

function windowUsefulnessRank(window: ForecastCalculationResult["bestWindows"][number]): number {
  if (window.windowLevel === "best") {
    return 4;
  }
  if (window.windowLevel === "shootable") {
    return 3;
  }
  if (window.windowLevel === "watchable") {
    return 2;
  }
  if (window.windowLevel === "blocked") {
    return 0;
  }
  return 1;
}

function isMorningWindow(window: ForecastCalculationResult["bestWindows"][number]): boolean {
  if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
    return true;
  }
  if (window.lightPhase === "sunset" || window.lightPhase === "blue_hour") {
    return false;
  }
  const hour = hourFromIsoLike(window.startTime);
  if (typeof hour === "number") {
    return hour < 12;
  }
  const subject = `${window.subjectPriorityLabel ?? ""} ${window.label}`;
  return subject.includes("朝霞") || subject.includes("日出");
}

function startDateTimeForSubjectContext(
  context: SubjectDetailDeepLinkContext,
): string | undefined {
  const offset = offsetFromIsoDateTime(context.windowStart) ?? "+08:00";
  return isValidDateString(context.date) ? `${context.date}T00:00:00${offset}` : undefined;
}

function offsetFromIsoDateTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = /(Z|[+-]\d{2}:\d{2})$/.exec(value);
  return match?.[1];
}

function normalizeSubjectTarget(value: string | undefined): SubjectDetailTarget | undefined {
  return value && subjectTargets.has(value as SubjectDetailTarget)
    ? (value as SubjectDetailTarget)
    : undefined;
}

function normalizeSubject(value: string | undefined): SubjectDetailSubject | undefined {
  return value && subjectValues.has(value as SubjectDetailSubject)
    ? (value as SubjectDetailSubject)
    : undefined;
}

function normalizeForecastHorizon(value: string | undefined): ForecastHorizon | undefined {
  return value && forecastHorizons.has(value as ForecastHorizon) ? (value as ForecastHorizon) : undefined;
}

function normalizeElevationSource(value: string | undefined): ElevationSource | undefined {
  const values = new Set<ElevationSource>([
    "manual",
    "provider_metadata",
    "dem",
    "amap",
    "open_meteo",
    "open_meteo_elevation",
    "unknown",
  ]);
  return value && values.has(value as ElevationSource) ? (value as ElevationSource) : undefined;
}

function normalizeElevationConfidence(value: string | undefined): ElevationConfidence | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function isValidDateString(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function firstParam(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return value?.[0];
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined | null,
): void {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    params.set(key, String(value));
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function hourFromIsoLike(value: string): number | undefined {
  const match = /T(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }

  return window.sessionStorage;
}
