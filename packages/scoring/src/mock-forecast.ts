import type {
  AstroCalculationBasis,
  AstroSummary,
  AstroWindowBundle,
  ForecastCalculationBasis,
  ForecastCalendarDayInfo,
  ForecastCalculationInput,
  ForecastHorizon,
  ForecastQueryInput,
  ForecastTarget,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  Place,
  TerrainAnalysisSummary,
  TerrainSummary,
  WeatherDataMode,
  WeatherFusionSummary,
} from "@photo-weather/shared";
import type { WeatherDataBundle } from "@photo-weather/weather";
import {
  addHoursInTimezone,
  buildForecastDateRange,
  defaultTimezone,
  formatChineseDate,
  formatChineseDateTime,
  formatChineseDateTimeRange,
  forecastDateRangeErrorMessage,
  getChineseCalendarInfo,
  getHourInTimezone,
  type CalendarDateInput,
  type ForecastDateRange,
} from "@photo-weather/calendar";
import {
  getAstronomicalNightWindow,
  getMilkyWayWindow,
  getMoonAltitudeByHour,
  getMoonPhase,
  getMoonTimes,
  getSunTimes,
  getTwilightTimes,
} from "@photo-weather/astro";
import { buildMockTerrainAnalysis } from "@photo-weather/terrain";
import { clampScore } from "./helpers.js";

type MockPlaceProfile = {
  readonly key: string;
  readonly adminArea: string;
  readonly locality: string;
  readonly elevation: number;
  readonly humidityBase: number;
  readonly lowCloudBase: number;
  readonly midCloudBase: number;
  readonly highCloudBase: number;
  readonly windBase: number;
  readonly visibilityBase: number;
  readonly precipitationBase: number;
  readonly tempBase: number;
};

type MockGenerationOptions = {
  readonly placeName?: string;
  readonly target?: ForecastTarget;
  readonly latitudeWgs84?: number;
  readonly longitudeWgs84?: number;
  readonly forecastRange?: ForecastDateRange;
  readonly now?: CalendarDateInput;
  readonly timezone?: string;
};

export type NormalizedForecastInputOptions = {
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly dailyWeather: readonly NormalizedDailyWeather[];
  readonly isMock: boolean;
  readonly dataSourceLabel: string;
  readonly weatherProviderCode?: string;
  readonly weatherProviderLabelZh?: string;
  readonly weatherDataMode?: WeatherDataMode;
  readonly weatherNoticeZh?: string;
  readonly weatherMissingFields?: readonly string[];
  readonly weatherEstimatedFields?: readonly string[];
  readonly weatherFusionSummary?: WeatherFusionSummary;
};

export type ForecastInputBuildOptions = {
  readonly forecastRange?: ForecastDateRange;
  readonly now?: CalendarDateInput;
  readonly timezone?: string;
  readonly terrainAnalysis?: TerrainAnalysisSummary;
  readonly astroSummaries?: readonly AstroSummary[];
  readonly astroDataSourceLabelZh?: string;
  readonly astroCalculationBasis?: AstroCalculationBasis;
  readonly astroWindowBundle?: AstroWindowBundle;
};

const profiles: readonly MockPlaceProfile[] = [
  {
    key: "huangshan",
    adminArea: "安徽省",
    locality: "黄山市",
    elevation: 1860,
    humidityBase: 72,
    lowCloudBase: 38,
    midCloudBase: 34,
    highCloudBase: 28,
    windBase: 2.8,
    visibilityBase: 24,
    precipitationBase: 12,
    tempBase: 16,
  },
  {
    key: "laojunshan",
    adminArea: "河南省",
    locality: "洛阳市",
    elevation: 2190,
    humidityBase: 66,
    lowCloudBase: 30,
    midCloudBase: 38,
    highCloudBase: 32,
    windBase: 3.8,
    visibilityBase: 26,
    precipitationBase: 9,
    tempBase: 14,
  },
  {
    key: "sanqingshan",
    adminArea: "江西省",
    locality: "上饶市",
    elevation: 1600,
    humidityBase: 80,
    lowCloudBase: 52,
    midCloudBase: 36,
    highCloudBase: 24,
    windBase: 2.4,
    visibilityBase: 16,
    precipitationBase: 22,
    tempBase: 17,
  },
  {
    key: "wugongshan",
    adminArea: "江西省",
    locality: "萍乡市",
    elevation: 1918,
    humidityBase: 58,
    lowCloudBase: 22,
    midCloudBase: 25,
    highCloudBase: 26,
    windBase: 4.2,
    visibilityBase: 32,
    precipitationBase: 7,
    tempBase: 15,
  },
];

const defaultProfile = profiles[0]!;
const moonCalculationNoteZh =
  "月相基于本地天文算法计算；农历日期基于本地历法库生成。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。";

export function buildMockForecastInput(
  query: ForecastQueryInput,
  options: ForecastInputBuildOptions = {},
): ForecastCalculationInput {
  const forecastRange = resolveForecastRange(query.horizon, options);

  return buildForecastInputFromNormalizedWeather(
    query,
    {
      hourlyWeather: generateMockHourlyWeather(query.horizon, {
        placeName: query.name,
        target: query.target,
        forecastRange,
      }),
      dailyWeather: generateMockDailyWeather(query.horizon, {
        placeName: query.name,
        target: query.target,
        forecastRange,
        latitudeWgs84: query.latitudeWgs84,
        longitudeWgs84: query.longitudeWgs84,
      }),
      isMock: true,
      dataSourceLabel: "演示数据",
      weatherProviderCode: "mock",
      weatherProviderLabelZh: "演示数据",
      weatherDataMode: "mock",
      weatherNoticeZh: "天气数据：演示数据",
    },
    {
      forecastRange,
      terrainAnalysis: options.terrainAnalysis,
    },
  );
}

export function buildForecastInputFromWeatherBundle(
  query: ForecastQueryInput,
  weatherBundle: WeatherDataBundle,
  options: ForecastInputBuildOptions = {},
): ForecastCalculationInput {
  return buildForecastInputFromNormalizedWeather(
    query,
    {
      hourlyWeather: weatherBundle.hourly,
      dailyWeather: weatherBundle.daily,
      isMock: weatherBundle.dataMode !== "real",
      dataSourceLabel: weatherBundle.providerLabelZh,
      weatherProviderCode: weatherBundle.providerCode,
      weatherProviderLabelZh: weatherBundle.providerLabelZh,
      weatherDataMode: weatherBundle.dataMode,
      weatherNoticeZh: weatherBundle.noticeZh,
      weatherMissingFields: collectWeatherFields(
        weatherBundle.hourly,
        weatherBundle.daily,
        "missingFields",
      ),
      weatherEstimatedFields: collectWeatherFields(
        weatherBundle.hourly,
        weatherBundle.daily,
        "estimatedFields",
      ),
      weatherFusionSummary: weatherBundle.fusionSummary,
    },
    options,
  );
}

export function buildForecastInputFromNormalizedWeather(
  query: ForecastQueryInput,
  weather: NormalizedForecastInputOptions,
  options: ForecastInputBuildOptions = {},
): ForecastCalculationInput {
  assertValidWgs84Coordinate(query.latitudeWgs84, "latitudeWgs84", -90, 90);
  assertValidWgs84Coordinate(query.longitudeWgs84, "longitudeWgs84", -180, 180);

  const profile = resolveProfile(query.name);
  const forecastRange = resolveForecastRange(query.horizon, options);
  const place: Place = {
    id: query.photoSpotId ?? query.locationId ?? `mock-${profile.key}`,
    name: query.name,
    countryCode: "CN",
    adminArea: profile.adminArea,
    locality: profile.locality,
    coordinates: {
      latitude: query.latitudeWgs84,
      longitude: query.longitudeWgs84,
      system: "wgs84",
    },
  };
  const generationOptions = { placeName: query.name, target: query.target, forecastRange };
  const weatherProviderLabelZh = weather.weatherProviderLabelZh ?? weather.dataSourceLabel;
  const weatherDataMode = weather.weatherDataMode ?? (weather.isMock ? "mock" : "real");
  const weatherMissingFields =
    weather.weatherMissingFields ??
    collectWeatherFields(weather.hourlyWeather, weather.dailyWeather, "missingFields");
  const weatherEstimatedFields =
    weather.weatherEstimatedFields ??
    collectWeatherFields(weather.hourlyWeather, weather.dailyWeather, "estimatedFields");
  const terrainAnalysis =
    options.terrainAnalysis ??
    buildMockTerrainAnalysis({
      locationName: query.name,
      coordinate: {
        ...place.coordinates,
        name: query.name,
      },
    });

  return {
    place,
    horizon: query.horizon,
    target: query.target,
    calendarBasis: buildCalculationBasis(query, forecastRange),
    hourlyWeather: weather.hourlyWeather,
    dailyWeather: weather.dailyWeather,
    terrainSummary: flattenTerrainAnalysis(terrainAnalysis),
    terrainAnalysis,
    astroSummaries:
      options.astroSummaries ??
      generateLocalAstroSummaries(query.horizon, {
        ...generationOptions,
        latitudeWgs84: query.latitudeWgs84,
        longitudeWgs84: query.longitudeWgs84,
      }),
    generatedAt: forecastRange.forecastStart,
    isMock: weather.isMock,
    dataSourceLabel: weather.dataSourceLabel,
    weatherProviderCode: weather.weatherProviderCode ?? (weather.isMock ? "mock" : "unknown"),
    weatherProviderLabelZh,
    weatherDataMode,
    weatherNoticeZh: weather.weatherNoticeZh ?? `天气数据：${weatherProviderLabelZh}`,
    weatherMissingFields,
    weatherEstimatedFields,
    weatherFusionSummary: weather.weatherFusionSummary,
    astroDataSourceLabelZh:
      options.astroDataSourceLabelZh ??
      (query.target === "astro" ? "简化本地估算" : "本地算法计算"),
    astroCalculationBasis: options.astroCalculationBasis,
    astroWindowBundle: options.astroWindowBundle,
  };
}

export function generateMockHourlyWeather(
  horizon: ForecastHorizon,
  options: MockGenerationOptions = {},
): readonly NormalizedHourlyWeather[] {
  const profile = resolveProfile(options.placeName);
  const forecastRange = resolveForecastRange(horizon, options);
  const hours = forecastRange.horizonHours;

  return Array.from({ length: hours }, (_, index) => {
    const dateTime = addHoursInTimezone(forecastRange.forecastStart, index, forecastRange.timezone);
    const localHour = getHourInTimezone(dateTime, forecastRange.timezone);
    const isMorning = localHour >= 4 && localHour <= 8;
    const isSunset = localHour >= 16 && localHour <= 19;
    const isAfternoon = localHour >= 12 && localHour <= 16;
    const isNight = localHour >= 20 || localHour <= 5;
    const targetCloudSeaBoost = options.target === "cloud_sea" && isMorning ? 7 : 0;
    const targetGlowBoost = options.target === "glow" && (isMorning || isSunset) ? 8 : 0;
    const targetAstroClear = options.target === "astro" && isNight ? 12 : 0;
    const cycle = Math.sin(((localHour - 6) / 24) * Math.PI * 2);
    const terrainCooling = Math.max(0, (profile.elevation - 1200) / 500);
    const temperature = round1(profile.tempBase + cycle * 5 - terrainCooling);
    const humidity = clampScore(
      profile.humidityBase +
        (isMorning ? 15 : 0) +
        (isNight ? 7 : 0) -
        (isAfternoon ? 11 : 0) +
        targetCloudSeaBoost -
        (options.target === "astro" && isNight ? 7 : 0),
    );
    const windSpeed = round1(
      Math.max(0.7, profile.windBase + (isAfternoon ? 1.4 : 0) - (isMorning ? 0.8 : 0)),
    );
    const lowCloud = clampScore(
      profile.lowCloudBase +
        (isMorning ? 20 : 0) +
        (isNight ? 5 : 0) -
        (isAfternoon ? 9 : 0) +
        targetCloudSeaBoost -
        targetAstroClear * 0.8,
    );
    const cloudMid = clampScore(
      profile.midCloudBase + (isMorning || isSunset ? 18 : 0) + targetGlowBoost - targetAstroClear,
    );
    const cloudHigh = clampScore(
      profile.highCloudBase +
        (isMorning || isSunset ? 14 : 0) +
        targetGlowBoost * 0.8 -
        targetAstroClear,
    );
    const cloudTotal = clampScore(
      Math.max(lowCloud, cloudMid, cloudHigh) + (lowCloud + cloudMid + cloudHigh) * 0.18,
    );
    const precipitationProbability = clampScore(
      profile.precipitationBase + (isAfternoon ? 10 : 0) + (cloudTotal > 78 ? 9 : 0),
    );
    const visibility = round1(
      Math.max(
        2.5,
        profile.visibilityBase +
          (isNight ? 2 : 0) -
          Math.max(0, humidity - 70) * 0.16 -
          lowCloud * 0.055 -
          precipitationProbability * 0.055,
      ),
    );
    const dewPointSpread = Math.max(1.2, (100 - humidity) / 8 + windSpeed * 0.45);

    return {
      time: dateTime,
      temperature,
      feelsLike: round1(temperature - windSpeed * 0.25),
      humidity,
      pressure: Math.round(1013 - profile.elevation * 0.11),
      windSpeed,
      windGust: round1(windSpeed + 2.1 + (isAfternoon ? 1.2 : 0)),
      windDirection: (120 + index * 17 + placeSeed(profile.key)) % 360,
      precipitationProbability,
      precipitation: round1(precipitationProbability > 55 ? precipitationProbability / 28 : 0),
      visibility,
      dewPoint: round1(temperature - dewPointSpread),
      cloudTotal,
      cloudLow: lowCloud,
      cloudMid,
      cloudHigh,
      weatherCode:
        precipitationProbability > 55
          ? "mock-rain"
          : cloudTotal > 65
            ? "mock-cloudy"
            : "mock-clear",
      providerCode: "mock-weather-v1",
      sourceConfidence: 0.78,
    };
  });
}

export function generateMockDailyWeather(
  horizon: ForecastHorizon,
  options: MockGenerationOptions = {},
): readonly NormalizedDailyWeather[] {
  const profile = resolveProfile(options.placeName);
  const forecastRange = resolveForecastRange(horizon, options);

  return forecastRange.targetDates.map((date, dayIndex) => {
    const precipitationProbability = clampScore(profile.precipitationBase + dayIndex * 3);
    const sunTimes = getDailySunTimes(date, forecastRange.timezone, options);

    return {
      date,
      tempMin: round1(profile.tempBase - 5 + dayIndex * 0.2),
      tempMax: round1(profile.tempBase + 6 + dayIndex * 0.3),
      precipitationProbability,
      weatherSummary:
        precipitationProbability >= 45 ? "阵雨间歇，云量偏多" : "多云间晴，山地局部有雾",
      sunrise: sunTimes?.sunrise,
      sunset: sunTimes?.sunset,
      providerCode: "mock",
    };
  });
}

function collectWeatherFields(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  dailyWeather: readonly NormalizedDailyWeather[],
  key: "missingFields" | "estimatedFields",
): readonly string[] {
  const values = new Set<string>();

  for (const hour of hourlyWeather) {
    for (const field of hour[key] ?? []) {
      values.add(field);
    }
  }
  for (const day of dailyWeather) {
    for (const field of day[key] ?? []) {
      values.add(field);
    }
  }

  return [...values].sort();
}

export function generateMockTerrainSummary(place: Place): TerrainSummary {
  return flattenTerrainAnalysis(
    buildMockTerrainAnalysis({
      locationName: place.name,
      coordinate: {
        ...place.coordinates,
        name: place.name,
      },
    }),
  );
}

function flattenTerrainAnalysis(analysis: TerrainAnalysisSummary): TerrainSummary {
  return {
    locationElevation: analysis.terrainProfile.locationElevation,
    minElevation1km: analysis.terrainProfile.minElevation1km,
    minElevation3km: analysis.terrainProfile.minElevation3km,
    minElevation5km: analysis.terrainProfile.minElevation5km,
    maxElevation5km: analysis.terrainProfile.maxElevation5km,
    avgElevation5km: analysis.terrainProfile.avgElevation5km,
    elevationDiff5km: analysis.terrainProfile.elevationDiff5km,
    valleyDirectionZh: analysis.terrainProfile.valleyDirectionZh,
    ridgeDirectionZh: analysis.terrainProfile.ridgeDirectionZh,
    terrainCloudSeaPotential: analysis.terrainProfile.terrainCloudSeaPotential,
    terrainNoteZh: analysis.terrainProfile.terrainNoteZh,
    sunriseHorizonAngle: analysis.horizonProfile.sunriseHorizonAngle,
    sunsetHorizonAngle: analysis.horizonProfile.sunsetHorizonAngle,
    milkyWayHorizonAngle: analysis.horizonProfile.milkyWayHorizonAngle,
    blockedDirectionsZh: analysis.horizonProfile.blockedDirectionsZh,
    obstructionNoteZh: analysis.horizonProfile.obstructionNoteZh,
    dataSource: analysis.dataSource,
    dataSourceLabelZh: analysis.dataSourceLabelZh,
    isMock: analysis.isMock,
    honestyNoteZh: analysis.honestyNoteZh,
  };
}

export function generateLocalAstroSummaries(
  horizon: ForecastHorizon,
  options: MockGenerationOptions = {},
): readonly AstroSummary[] {
  const forecastRange = resolveForecastRange(horizon, options);
  const latitudeWgs84 = requireWgs84Coordinate(options.latitudeWgs84, "latitudeWgs84", -90, 90);
  const longitudeWgs84 = requireWgs84Coordinate(
    options.longitudeWgs84,
    "longitudeWgs84",
    -180,
    180,
  );

  return forecastRange.targetDates.map((date) => {
    const astroInput = {
      latitudeWgs84,
      longitudeWgs84,
      date,
      timezone: forecastRange.timezone,
    };
    const sunTimes = getSunTimes(astroInput);
    const twilightTimes = getTwilightTimes(astroInput);
    const moonPhase = getMoonPhase(astroInput);
    const moonTimes = getMoonTimes(astroInput);
    const moonAltitude = getMoonAltitudeByHour(astroInput);
    const astronomicalNight = getAstronomicalNightWindow(astroInput);
    const milkyWayWindow = getMilkyWayWindow(astroInput);
    const calendarInfo = getChineseCalendarInfo(date, forecastRange.timezone);
    const moonInfo = {
      moonPhase: moonPhase.moonPhase,
      moonPhaseNameZh: moonPhase.moonPhaseNameZh,
      moonIllumination: moonPhase.moonIllumination,
      waxingOrWaning: moonPhase.waxingOrWaning,
      lunarDateText: calendarInfo.lunarDateText,
      solarTerm: calendarInfo.solarTerm,
      moonrise: moonTimes.moonrise,
      moonset: moonTimes.moonset,
      moonAltitudeByHour: moonAltitude.moonAltitudeByHour,
      calculationNoteZh: moonCalculationNoteZh,
    };

    return {
      date,
      timezone: forecastRange.timezone,
      sunrise: sunTimes.sunrise,
      sunset: sunTimes.sunset,
      solarNoon: sunTimes.solarNoon,
      sunriseAzimuth: sunTimes.sunriseAzimuth,
      sunsetAzimuth: sunTimes.sunsetAzimuth,
      civilDawn: twilightTimes.civilDawn,
      civilDusk: twilightTimes.civilDusk,
      nauticalDawn: twilightTimes.nauticalDawn,
      nauticalDusk: twilightTimes.nauticalDusk,
      astronomicalDawn: twilightTimes.astronomicalDawn,
      astronomicalDusk: twilightTimes.astronomicalDusk,
      astronomicalNightStart: astronomicalNight.windowStart,
      astronomicalNightEnd: astronomicalNight.windowEnd,
      moonPhase: moonPhase.moonPhase,
      moonPhaseNameZh: moonPhase.moonPhaseNameZh,
      moonIllumination: moonPhase.moonIllumination,
      waxingOrWaning: moonPhase.waxingOrWaning,
      lunarDateText: calendarInfo.lunarDateText,
      solarTerm: calendarInfo.solarTerm,
      moonrise: moonTimes.moonrise,
      moonset: moonTimes.moonset,
      moonAltitudeByHour: moonAltitude.moonAltitudeByHour,
      calculationNoteZh: moonCalculationNoteZh,
      moonInfo,
      milkyWayWindowStart: milkyWayWindow.windowStart,
      milkyWayWindowEnd: milkyWayWindow.windowEnd,
      milkyWayBestTime: milkyWayWindow.bestTime,
      milkyWayDirection: milkyWayWindow.directionZh,
      milkyWayGalacticCenterAltitude: milkyWayWindow.galacticCenterAltitude,
      milkyWayGalacticCenterAzimuth: milkyWayWindow.galacticCenterAzimuth,
      milkyWayCalculationPrecision: milkyWayWindow.calculationPrecision,
      milkyWayVisibilityLevel: milkyWayWindow.visibilityLevel,
      milkyWayNoteZh: milkyWayWindow.noteZh,
    };
  });
}

function resolveProfile(placeName: string | undefined): MockPlaceProfile {
  const normalizedName = placeName?.trim() ?? "";

  if (normalizedName.includes("老君山")) {
    return profiles[1]!;
  }
  if (normalizedName.includes("三清山")) {
    return profiles[2]!;
  }
  if (normalizedName.includes("武功山")) {
    return profiles[3]!;
  }
  if (normalizedName.includes("黄山")) {
    return profiles[0]!;
  }

  return defaultProfile;
}

function placeSeed(value: string): number {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function resolveForecastRange(
  horizon: ForecastHorizon,
  options: ForecastInputBuildOptions | MockGenerationOptions,
): ForecastDateRange {
  return (
    options.forecastRange ??
    buildForecastDateRange(horizon, {
      now: options.now,
      timezone: options.timezone ?? defaultTimezone,
    })
  );
}

function buildCalculationBasis(
  query: ForecastQueryInput,
  forecastRange: ForecastDateRange,
): ForecastCalculationBasis {
  return {
    forecastStart: forecastRange.forecastStart,
    forecastEnd: forecastRange.forecastEnd,
    forecastStartLabel: formatChineseDateTime(forecastRange.forecastStart, forecastRange.timezone),
    forecastEndLabel: formatChineseDateTime(forecastRange.forecastEnd, forecastRange.timezone),
    forecastRangeLabel: formatChineseDateTimeRange(
      forecastRange.forecastStart,
      forecastRange.forecastEnd,
      forecastRange.timezone,
    ),
    targetDates: forecastRange.targetDates,
    targetDateLabels: forecastRange.targetDates.map((date) =>
      formatChineseDate(date, forecastRange.timezone),
    ),
    horizonHours: forecastRange.horizonHours,
    timezone: forecastRange.timezone,
    timezoneLabel:
      forecastRange.timezone === defaultTimezone
        ? "Asia/Shanghai（中国标准时间）"
        : forecastRange.timezone,
    calendarDays: forecastRange.targetDates.map((date) =>
      buildCalendarDayInfo(date, forecastRange.timezone),
    ),
    wgs84Coordinates: {
      latitude: query.latitudeWgs84,
      longitude: query.longitudeWgs84,
    },
    coordinateSource: getCoordinateSourceLabel(query.source),
  };
}

function buildCalendarDayInfo(date: string, timezone: string): ForecastCalendarDayInfo {
  const calendarInfo = getChineseCalendarInfo(date, timezone);

  return {
    date,
    dateLabel: formatChineseDate(date, timezone),
    lunarDateText: calendarInfo.lunarDateText,
    solarTerm: calendarInfo.solarTerm,
    ganzhiYear: calendarInfo.ganzhiYear,
    zodiac: calendarInfo.zodiac,
  };
}

function getCoordinateSourceLabel(source: string): string {
  switch (source) {
    case "local_photo_spot":
      return "本地机位 WGS84 坐标";
    case "local_location":
      return "本地地点 WGS84 坐标";
    case "amap":
      return "高德地点转换后的 WGS84 坐标";
    case "mock":
      return "模拟地点 WGS84 坐标";
    default:
      return "查询地点 WGS84 坐标";
  }
}

function getDailySunTimes(
  date: string,
  timezone: string,
  options: Pick<MockGenerationOptions, "latitudeWgs84" | "longitudeWgs84">,
): Pick<NormalizedDailyWeather, "sunrise" | "sunset"> | undefined {
  if (
    typeof options.latitudeWgs84 !== "number" ||
    typeof options.longitudeWgs84 !== "number" ||
    !Number.isFinite(options.latitudeWgs84) ||
    !Number.isFinite(options.longitudeWgs84)
  ) {
    return undefined;
  }

  const sunTimes = getSunTimes({
    latitudeWgs84: options.latitudeWgs84,
    longitudeWgs84: options.longitudeWgs84,
    date,
    timezone,
  });

  return {
    sunrise: sunTimes.sunrise,
    sunset: sunTimes.sunset,
  };
}

function requireWgs84Coordinate(
  value: number | undefined,
  _label: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error("当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。");
  }

  return value;
}

function assertValidWgs84Coordinate(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      label === "latitudeWgs84" || label === "longitudeWgs84"
        ? "当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。"
        : forecastDateRangeErrorMessage,
    );
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
