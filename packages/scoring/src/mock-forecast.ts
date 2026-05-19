import type {
  AstroSummary,
  ForecastCalculationInput,
  ForecastHorizon,
  ForecastQueryInput,
  ForecastTarget,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  Place,
  TerrainSummary,
} from "@photo-weather/shared";
import { clampScore, getHorizonHours } from "./helpers.js";

type MockPlaceProfile = {
  readonly key: string;
  readonly adminArea: string;
  readonly locality: string;
  readonly elevation: number;
  readonly minElevation1km: number;
  readonly minElevation3km: number;
  readonly minElevation5km: number;
  readonly maxElevation5km: number;
  readonly valleyDirection: string;
  readonly sunriseHorizonAngle: number;
  readonly sunsetHorizonAngle: number;
  readonly terrainCloudSeaPotential: "low" | "medium" | "high";
  readonly humidityBase: number;
  readonly lowCloudBase: number;
  readonly midCloudBase: number;
  readonly highCloudBase: number;
  readonly windBase: number;
  readonly visibilityBase: number;
  readonly precipitationBase: number;
  readonly tempBase: number;
  readonly sunriseClock: string;
  readonly sunsetClock: string;
  readonly moonIlluminationBase: number;
};

type MockGenerationOptions = {
  readonly placeName?: string;
  readonly target?: ForecastTarget;
};

const generatedAt = "2026-05-19T08:00:00+08:00";
const baseUtcMs = Date.UTC(2026, 4, 19, 16, 0, 0);
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

const profiles: readonly MockPlaceProfile[] = [
  {
    key: "huangshan",
    adminArea: "安徽省",
    locality: "黄山市",
    elevation: 1860,
    minElevation1km: 980,
    minElevation3km: 520,
    minElevation5km: 380,
    maxElevation5km: 1864,
    valleyDirection: "东南",
    sunriseHorizonAngle: 4.8,
    sunsetHorizonAngle: 5.5,
    terrainCloudSeaPotential: "high",
    humidityBase: 72,
    lowCloudBase: 38,
    midCloudBase: 34,
    highCloudBase: 28,
    windBase: 2.8,
    visibilityBase: 24,
    precipitationBase: 12,
    tempBase: 16,
    sunriseClock: "05:18",
    sunsetClock: "18:56",
    moonIlluminationBase: 34,
  },
  {
    key: "laojunshan",
    adminArea: "河南省",
    locality: "洛阳市",
    elevation: 2190,
    minElevation1km: 1280,
    minElevation3km: 780,
    minElevation5km: 560,
    maxElevation5km: 2217,
    valleyDirection: "西南",
    sunriseHorizonAngle: 6.2,
    sunsetHorizonAngle: 7.4,
    terrainCloudSeaPotential: "high",
    humidityBase: 66,
    lowCloudBase: 30,
    midCloudBase: 38,
    highCloudBase: 32,
    windBase: 3.8,
    visibilityBase: 26,
    precipitationBase: 9,
    tempBase: 14,
    sunriseClock: "05:26",
    sunsetClock: "19:24",
    moonIlluminationBase: 42,
  },
  {
    key: "sanqingshan",
    adminArea: "江西省",
    locality: "上饶市",
    elevation: 1600,
    minElevation1km: 870,
    minElevation3km: 510,
    minElevation5km: 410,
    maxElevation5km: 1819,
    valleyDirection: "东北",
    sunriseHorizonAngle: 8.4,
    sunsetHorizonAngle: 6.5,
    terrainCloudSeaPotential: "medium",
    humidityBase: 80,
    lowCloudBase: 52,
    midCloudBase: 36,
    highCloudBase: 24,
    windBase: 2.4,
    visibilityBase: 16,
    precipitationBase: 22,
    tempBase: 17,
    sunriseClock: "05:20",
    sunsetClock: "18:58",
    moonIlluminationBase: 47,
  },
  {
    key: "wugongshan",
    adminArea: "江西省",
    locality: "萍乡市",
    elevation: 1918,
    minElevation1km: 1120,
    minElevation3km: 720,
    minElevation5km: 610,
    maxElevation5km: 1918,
    valleyDirection: "东南",
    sunriseHorizonAngle: 3.7,
    sunsetHorizonAngle: 4.6,
    terrainCloudSeaPotential: "high",
    humidityBase: 58,
    lowCloudBase: 22,
    midCloudBase: 25,
    highCloudBase: 26,
    windBase: 4.2,
    visibilityBase: 32,
    precipitationBase: 7,
    tempBase: 15,
    sunriseClock: "05:34",
    sunsetClock: "19:08",
    moonIlluminationBase: 24,
  },
];

const defaultProfile = profiles[0]!;

export function buildMockForecastInput(query: ForecastQueryInput): ForecastCalculationInput {
  const profile = resolveProfile(query.name);
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
  const options = { placeName: query.name, target: query.target };

  return {
    place,
    horizon: query.horizon,
    target: query.target,
    hourlyWeather: generateMockHourlyWeather(query.horizon, options),
    dailyWeather: generateMockDailyWeather(query.horizon, options),
    terrainSummary: generateMockTerrainSummary(place),
    astroSummaries: generateMockAstroSummaries(query.horizon, options),
    generatedAt,
    isMock: true,
  };
}

export function generateMockHourlyWeather(
  horizon: ForecastHorizon,
  options: MockGenerationOptions = {},
): readonly NormalizedHourlyWeather[] {
  const profile = resolveProfile(options.placeName);
  const hours = getHorizonHours(horizon);

  return Array.from({ length: hours }, (_, index) => {
    const dateTime = formatShanghaiDateTime(baseUtcMs + index * hourMs);
    const localHour = index % 24;
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
  const days = horizon === "7d" ? 7 : Math.ceil(getHorizonHours(horizon) / 24);

  return Array.from({ length: days }, (_, dayIndex) => {
    const date = formatShanghaiDate(baseUtcMs + dayIndex * dayMs);
    const precipitationProbability = clampScore(profile.precipitationBase + dayIndex * 3);

    return {
      date,
      tempMin: round1(profile.tempBase - 5 + dayIndex * 0.2),
      tempMax: round1(profile.tempBase + 6 + dayIndex * 0.3),
      precipitationProbability,
      weatherSummary:
        precipitationProbability >= 45 ? "阵雨间歇，云量偏多" : "多云间晴，山地局部有雾",
      sunrise: `${date}T${profile.sunriseClock}:00+08:00`,
      sunset: `${date}T${profile.sunsetClock}:00+08:00`,
    };
  });
}

export function generateMockTerrainSummary(place: Place): TerrainSummary {
  const profile = resolveProfile(place.name);

  return {
    locationElevation: profile.elevation,
    minElevation1km: profile.minElevation1km,
    minElevation3km: profile.minElevation3km,
    minElevation5km: profile.minElevation5km,
    maxElevation5km: profile.maxElevation5km,
    elevationDiff5km: profile.maxElevation5km - profile.minElevation5km,
    valleyDirection: profile.valleyDirection,
    sunriseHorizonAngle: profile.sunriseHorizonAngle,
    sunsetHorizonAngle: profile.sunsetHorizonAngle,
    terrainCloudSeaPotential: profile.terrainCloudSeaPotential,
  };
}

export function generateMockAstroSummaries(
  horizon: ForecastHorizon,
  options: MockGenerationOptions = {},
): readonly AstroSummary[] {
  const profile = resolveProfile(options.placeName);
  const days = horizon === "7d" ? 7 : Math.ceil(getHorizonHours(horizon) / 24);

  return Array.from({ length: days }, (_, dayIndex) => {
    const date = formatShanghaiDate(baseUtcMs + dayIndex * dayMs);
    const sunrise = `${date}T${profile.sunriseClock}:00+08:00`;
    const sunset = `${date}T${profile.sunsetClock}:00+08:00`;
    const moonIllumination = clampScore(
      profile.moonIlluminationBase + dayIndex * 6 + (options.target === "astro" ? -8 : 0),
    );

    return {
      date,
      sunrise,
      sunset,
      civilDawn: addMinutesToShanghaiIso(sunrise, -30),
      civilDusk: addMinutesToShanghaiIso(sunset, 30),
      nauticalDawn: addMinutesToShanghaiIso(sunrise, -60),
      nauticalDusk: addMinutesToShanghaiIso(sunset, 60),
      astronomicalDawn: addMinutesToShanghaiIso(sunrise, -90),
      astronomicalDusk: addMinutesToShanghaiIso(sunset, 90),
      moonPhase: moonIllumination < 25 ? "蛾眉月" : moonIllumination > 70 ? "盈凸月" : "上弦前后",
      moonIllumination,
      moonrise: `${date}T21:12:00+08:00`,
      moonset: addDaysToShanghaiIso(`${date}T09:36:00+08:00`, 1),
      moonAltitudeByHour: {
        "00": Math.max(0, 26 - dayIndex * 2),
        "01": Math.max(0, 20 - dayIndex * 2),
        "02": Math.max(0, 14 - dayIndex),
        "03": Math.max(0, 8 - dayIndex),
        "04": Math.max(0, 3 - dayIndex),
      },
      milkyWayWindowStart: `${date}T02:10:00+08:00`,
      milkyWayWindowEnd: `${date}T04:35:00+08:00`,
      milkyWayDirection: "东南至南方",
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

function formatShanghaiDateTime(timestamp: number): string {
  const date = new Date(timestamp + 8 * hourMs);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:00+08:00`;
}

function formatShanghaiDate(timestamp: number): string {
  const date = new Date(timestamp + 8 * hourMs);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addMinutesToShanghaiIso(value: string, minutes: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return formatShanghaiDateTime(timestamp + minutes * 60 * 1000);
}

function addDaysToShanghaiIso(value: string, days: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return formatShanghaiDateTime(timestamp + days * dayMs);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
