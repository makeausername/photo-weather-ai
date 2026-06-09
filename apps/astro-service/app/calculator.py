from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any
from zoneinfo import ZoneInfo

from skyfield import almanac
from skyfield.api import Star, load, load_file, wgs84

from .models import (
    AstroCalculateRequest,
    AstroCalculateResponse,
    AstronomicalNightWindow,
    CalculationBasis,
    DailyMoon,
    DailySun,
    MilkyWayBlock,
    MilkyWayCandidateWindow,
    MoonAltitudeSample,
    MoonBlock,
    MoonlessNightWindow,
    NightBlock,
    RecommendedMilkyWayWindow,
    SunBlock,
)
from .timezones import DEFAULT_TIMEZONE, get_timezone


EPHEMERIS_FILE_NAME = "de421.bsp"
MINIMUM_WINDOW_MINUTES = 30
SUN_CROSSING_STEP_MINUTES = 10
SOLAR_NOON_STEP_MINUTES = 10
MOON_ALTITUDE_STEP_MINUTES = 60
MOONLESS_WINDOW_STEP_MINUTES = 5
MOON_IMPACT_STEP_MINUTES = 15
GALACTIC_CENTER_STEP_MINUTES = 10
SOLAR_ALTITUDE_GLOW_STEP_MINUTES = 1
SUNRISE_GLOW_CANDIDATE_START_ALTITUDE = -6.0
SUNRISE_GLOW_CANDIDATE_END_ALTITUDE = 2.0
SUNRISE_GLOW_BEST_START_ALTITUDE = -4.0
SUNRISE_GLOW_BEST_END_ALTITUDE = 1.0
SUNSET_GLOW_CANDIDATE_START_ALTITUDE = 2.0
SUNSET_GLOW_CANDIDATE_END_ALTITUDE = -6.0
SUNSET_GLOW_BEST_START_ALTITUDE = 1.0
SUNSET_GLOW_BEST_END_ALTITUDE = -4.0
SAMPLING_RESOLUTION_MINUTES = {
    "sunCrossing": SUN_CROSSING_STEP_MINUTES,
    "solarNoon": SOLAR_NOON_STEP_MINUTES,
    "moonAltitude": MOON_ALTITUDE_STEP_MINUTES,
    "moonlessWindow": MOONLESS_WINDOW_STEP_MINUTES,
    "moonImpact": MOON_IMPACT_STEP_MINUTES,
    "galacticCenter": GALACTIC_CENTER_STEP_MINUTES,
    "solarAltitudeGlow": SOLAR_ALTITUDE_GLOW_STEP_MINUTES,
}


@dataclass(frozen=True)
class CalculationContext:
    latitude: float
    longitude: float
    elevation_m: float | None
    timezone_name: str
    timezone: ZoneInfo
    forecast_start: datetime
    forecast_end: datetime
    target_dates: tuple[date, ...]
    time_cache: dict[str, Any] = field(default_factory=dict, compare=False, repr=False)
    horizontal_cache: dict[tuple[str, str], "HorizontalPosition"] = field(
        default_factory=dict, compare=False, repr=False
    )
    moon_phase_cache: dict[str, tuple[float, float]] = field(
        default_factory=dict, compare=False, repr=False
    )
    moon_illumination_cache: dict[str, float] = field(
        default_factory=dict, compare=False, repr=False
    )


@dataclass(frozen=True)
class HorizontalPosition:
    altitude: float
    azimuth: float


@dataclass(frozen=True)
class AltitudeSample:
    timestamp: datetime
    altitude: float
    azimuth: float
    moon_impact_score: float


class EphemerisMissingError(RuntimeError):
    pass


class EphemerisLoadError(RuntimeError):
    pass


class AstronomyCalculator:
    def __init__(self, ephemeris_path: Path) -> None:
        if not ephemeris_path.exists():
            raise EphemerisMissingError(
                f"Missing ephemeris file: {ephemeris_path}. Run the documented setup step first."
            )

        self.ephemeris_path = ephemeris_path
        self.timescale = load.timescale()
        try:
            self.ephemeris = load_file(str(ephemeris_path))
            self.earth = self.ephemeris["earth"]
            self.sun = self.ephemeris["sun"]
            self.moon = self.ephemeris["moon"]
        except Exception as exc:
            raise EphemerisLoadError(f"Unable to load ephemeris file: {ephemeris_path}") from exc
        self.galactic_center = Star(
            ra_hours=(17, 45, 40.04),
            dec_degrees=(-29, 0, 28.1),
        )

    def calculate(self, request: AstroCalculateRequest) -> AstroCalculateResponse:
        started_at = perf_counter()
        context = build_context(request)
        observer = self._observer(context)
        sun_daily = [self._daily_sun(context, observer, target_date) for target_date in context.target_dates]
        astronomical_nights = [
            window
            for target_date in context.target_dates
            if (window := self._astronomical_night_window(context, observer, target_date)) is not None
        ]
        moon_daily = [
            self._daily_moon(context, observer, target_date, astronomical_nights)
            for target_date in context.target_dates
        ]
        moon_altitude_by_hour = self._moon_altitude_samples(
            context,
            observer,
            context.forecast_start,
            context.forecast_end,
            step=timedelta(minutes=MOON_ALTITUDE_STEP_MINUTES),
        )
        moonless_windows = [
            segment
            for night in astronomical_nights
            for segment in self._moonless_windows(context, observer, night)
        ]
        candidate_windows = [
            candidate
            for night in astronomical_nights
            for candidate in self._milky_way_candidates(context, observer, night)
        ]
        recommended_windows = self._recommended_milky_way_windows(
            context,
            observer,
            candidate_windows,
            moonless_windows,
        )
        direction_summary = direction_summary_zh(candidate_windows, recommended_windows)

        return AstroCalculateResponse(
            forecastStart=format_local_iso(context.forecast_start),
            forecastEnd=format_local_iso(context.forecast_end),
            targetDates=[target_date.isoformat() for target_date in context.target_dates],
            sun=SunBlock(daily=sun_daily),
            moon=MoonBlock(daily=moon_daily, altitudeByHour=moon_altitude_by_hour),
            night=NightBlock(
                astronomicalNightWindows=astronomical_nights,
                moonlessNightWindows=moonless_windows,
            ),
            milkyWay=MilkyWayBlock(
                candidateWindows=candidate_windows,
                recommendedWindows=recommended_windows,
                directionSummaryZh=direction_summary,
                calculationNoteZh=(
                    "天文数据：本地天文服务计算。银河窗口为本地天文服务计算结果，"
                    "已叠加月光影响、天文黑夜与银心高度；银心位置按 Sagittarius A* 附近 "
                    "J2000 坐标计算，仍需结合云量、光污染和地形遮挡复核。"
                ),
            ),
            calculationBasis=CalculationBasis(
                ephemerisFileName=self.ephemeris_path.name,
                coordinateSystem="WGS84",
                timezone=context.timezone_name,
                elevationMeters=context.elevation_m,
                generatedAt=format_local_iso(datetime.now(context.timezone)),
                computeElapsedMs=round((perf_counter() - started_at) * 1000, 1),
                samplingResolutionMinutes=SAMPLING_RESOLUTION_MINUTES,
            ),
        )

    def _observer(self, context: CalculationContext):
        return self.earth + wgs84.latlon(
            context.latitude,
            context.longitude,
            elevation_m=context.elevation_m or 0,
        )

    def _daily_sun(self, context: CalculationContext, observer, target_date: date) -> DailySun:
        day_start = local_midnight(target_date, context.timezone)
        day_end = day_start + timedelta(days=1)
        sunrise = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -0.833, "rising"
        )
        sunset = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -0.833, "setting"
        )
        civil_dawn = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -6.0, "rising"
        )
        civil_dusk = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -6.0, "setting"
        )
        nautical_dawn = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -12.0, "rising"
        )
        nautical_dusk = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -12.0, "setting"
        )
        astronomical_dawn = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -18.0, "rising"
        )
        astronomical_dusk = self._first_crossing(
            context, observer, self.sun, day_start, day_end, -18.0, "setting"
        )
        sunrise_glow_candidate_start = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNRISE_GLOW_CANDIDATE_START_ALTITUDE,
            "rising",
        )
        sunrise_glow_candidate_end = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNRISE_GLOW_CANDIDATE_END_ALTITUDE,
            "rising",
        )
        sunrise_glow_best_start = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNRISE_GLOW_BEST_START_ALTITUDE,
            "rising",
        )
        sunrise_glow_best_end = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNRISE_GLOW_BEST_END_ALTITUDE,
            "rising",
        )
        sunset_glow_candidate_start = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNSET_GLOW_CANDIDATE_START_ALTITUDE,
            "setting",
        )
        sunset_glow_candidate_end = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNSET_GLOW_CANDIDATE_END_ALTITUDE,
            "setting",
        )
        sunset_glow_best_start = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNSET_GLOW_BEST_START_ALTITUDE,
            "setting",
        )
        sunset_glow_best_end = self._first_crossing(
            context,
            observer,
            self.sun,
            day_start,
            day_end,
            SUNSET_GLOW_BEST_END_ALTITUDE,
            "setting",
        )
        solar_noon = self._solar_noon(context, observer, day_start, day_end)

        return DailySun(
            date=target_date.isoformat(),
            sunrise=format_optional_iso(sunrise),
            sunset=format_optional_iso(sunset),
            solarNoon=format_optional_iso(solar_noon),
            civilDawn=format_optional_iso(civil_dawn),
            civilDusk=format_optional_iso(civil_dusk),
            nauticalDawn=format_optional_iso(nautical_dawn),
            nauticalDusk=format_optional_iso(nautical_dusk),
            astronomicalDawn=format_optional_iso(astronomical_dawn),
            astronomicalDusk=format_optional_iso(astronomical_dusk),
            sunriseAzimuth=round1(self._horizontal(context, observer, self.sun, sunrise).azimuth)
            if sunrise
            else None,
            sunsetAzimuth=round1(self._horizontal(context, observer, self.sun, sunset).azimuth)
            if sunset
            else None,
            sunriseGlowCandidateStart=format_optional_iso(sunrise_glow_candidate_start),
            sunriseGlowCandidateEnd=format_optional_iso(sunrise_glow_candidate_end),
            sunriseGlowBestStart=format_optional_iso(sunrise_glow_best_start),
            sunriseGlowBestEnd=format_optional_iso(sunrise_glow_best_end),
            sunsetGlowCandidateStart=format_optional_iso(sunset_glow_candidate_start),
            sunsetGlowCandidateEnd=format_optional_iso(sunset_glow_candidate_end),
            sunsetGlowBestStart=format_optional_iso(sunset_glow_best_start),
            sunsetGlowBestEnd=format_optional_iso(sunset_glow_best_end),
        )

    def _daily_moon(
        self,
        context: CalculationContext,
        observer,
        target_date: date,
        astronomical_nights: list[AstronomicalNightWindow],
    ) -> DailyMoon:
        noon = datetime.combine(target_date, time(12, 0), context.timezone)
        phase_value, phase_degrees = self._moon_phase(context, noon)
        illumination = self._moon_illumination(context, noon)
        waxing_or_waning = "waxing" if phase_degrees < 180 else "waning" if phase_degrees > 180 else "unknown"
        night = next((item for item in astronomical_nights if item.date == target_date.isoformat()), None)
        moonrise, moonset = self._moon_events_for_night(context, observer, target_date, night)
        samples = self._moon_altitude_samples(
            context,
            observer,
            local_midnight(target_date, context.timezone),
            local_midnight(target_date, context.timezone) + timedelta(days=1),
            step=timedelta(minutes=MOON_ALTITUDE_STEP_MINUTES),
        )
        impact_score, impact_reasons = self._moon_impact_for_daily_window(
            context,
            observer,
            night,
            illumination,
        )

        return DailyMoon(
            date=target_date.isoformat(),
            moonPhaseValue=round3(phase_value),
            moonPhaseNameZh=moon_phase_name_zh(phase_value, illumination, waxing_or_waning),
            moonIllumination=round3(illumination),
            waxingOrWaning=waxing_or_waning,
            moonrise=format_optional_iso(moonrise),
            moonset=format_optional_iso(moonset),
            moonAltitudeByHour=samples,
            moonImpactLevel=moon_impact_level(impact_score),
            moonImpactScore=round1(impact_score),
            moonImpactReasonsZh=impact_reasons,
        )

    def _moon_events_for_night(
        self,
        context: CalculationContext,
        observer,
        target_date: date,
        night: AstronomicalNightWindow | None,
    ) -> tuple[datetime | None, datetime | None]:
        search_start = local_midnight(target_date, context.timezone)
        search_end = search_start + timedelta(days=2)
        rises = self._crossings(context, observer, self.moon, search_start, search_end, 0.0, "rising")
        sets = self._crossings(context, observer, self.moon, search_start, search_end, 0.0, "setting")
        day_end = search_start + timedelta(days=1)
        moonrise = next((item for item in rises if search_start <= item < day_end), None)
        if moonrise:
            moonset = next((item for item in sets if item > moonrise), None)
        elif night:
            night_start = parse_local_iso(night.start, context.timezone)
            moonset = next((item for item in sets if item >= night_start), None)
        else:
            moonset = next(iter(sets), None)
        return moonrise, moonset

    def _astronomical_night_window(
        self,
        context: CalculationContext,
        observer,
        target_date: date,
    ) -> AstronomicalNightWindow | None:
        day_start = local_midnight(target_date, context.timezone)
        next_day = day_start + timedelta(days=1)
        dusk = self._first_crossing(
            context, observer, self.sun, day_start, next_day, -18.0, "setting"
        )
        dawn = self._first_crossing(
            context,
            observer,
            self.sun,
            next_day,
            next_day + timedelta(days=1),
            -18.0,
            "rising",
        )
        if dusk is None or dawn is None or dawn <= dusk:
            return None

        start = max(dusk, context.forecast_start)
        end = min(dawn, context.forecast_end)
        duration = duration_minutes(start, end)
        if duration < MINIMUM_WINDOW_MINUTES:
            return None

        return AstronomicalNightWindow(
            date=target_date.isoformat(),
            start=format_local_iso(start),
            end=format_local_iso(end),
            durationMinutes=duration,
            noteZh="太阳高度低于 -18° 的时间段，适合作为星空与银河判断的基础黑夜窗口。",
        )

    def _moonless_windows(
        self,
        context: CalculationContext,
        observer,
        night: AstronomicalNightWindow,
    ) -> list[MoonlessNightWindow]:
        start = parse_local_iso(night.start, context.timezone)
        end = parse_local_iso(night.end, context.timezone)
        segments = self._boolean_segments(
            start,
            end,
            timedelta(minutes=MOONLESS_WINDOW_STEP_MINUTES),
            lambda moment: self._is_moonless(context, observer, moment),
        )
        windows: list[MoonlessNightWindow] = []
        for segment_start, segment_end in segments:
            if duration_minutes(segment_start, segment_end) < MINIMUM_WINDOW_MINUTES:
                continue
            mid = midpoint(segment_start, segment_end)
            moon = self._horizontal(context, observer, self.moon, mid)
            illumination = self._moon_illumination(context, mid)
            if moon.altitude <= 0:
                reason = "该窗口位于天文黑夜内，月亮低于地平线，月光不会直接压低银河对比度。"
            elif illumination < 0.12 and moon.altitude < 8:
                reason = "该窗口位于天文黑夜内，月亮照明很低且高度很低，月光影响按低影响处理。"
            else:
                reason = "该窗口位于天文黑夜内，月光影响较低，但仍需结合拍摄方向和云量复核。"
            windows.append(
                MoonlessNightWindow(
                    date=night.date,
                    start=format_local_iso(segment_start),
                    end=format_local_iso(segment_end),
                    durationMinutes=duration_minutes(segment_start, segment_end),
                    reasonZh=reason,
                )
            )
        return windows

    def _milky_way_candidates(
        self,
        context: CalculationContext,
        observer,
        night: AstronomicalNightWindow,
    ) -> list[MilkyWayCandidateWindow]:
        start = parse_local_iso(night.start, context.timezone)
        end = parse_local_iso(night.end, context.timezone)
        samples = self._galactic_center_samples(
            context, observer, start, end, timedelta(minutes=GALACTIC_CENTER_STEP_MINUTES)
        )
        raw_segments = contiguous_sample_segments(samples, lambda sample: sample.altitude > 5.0)
        windows: list[MilkyWayCandidateWindow] = []

        for segment in raw_segments:
            if len(segment) < 2:
                continue
            segment_start = segment[0].timestamp
            segment_end = min(
                segment[-1].timestamp + timedelta(minutes=GALACTIC_CENTER_STEP_MINUTES), end
            )
            if duration_minutes(segment_start, segment_end) < MINIMUM_WINDOW_MINUTES:
                continue
            best = max(segment, key=lambda sample: sample.altitude)
            min_altitude = min(sample.altitude for sample in segment)
            max_altitude = max(sample.altitude for sample in segment)
            windows.append(
                MilkyWayCandidateWindow(
                    date=night.date,
                    start=format_local_iso(segment_start),
                    end=format_local_iso(segment_end),
                    bestTime=format_local_iso(best.timestamp),
                    minAltitude=round1(min_altitude),
                    maxAltitude=round1(max_altitude),
                    bestAzimuth=round1(best.azimuth),
                    directionZh=direction_from_azimuth(best.azimuth),
                    confidenceLevel=milky_way_confidence(max_altitude, duration_minutes(segment_start, segment_end)),
                    noteZh="银心高度超过 5° 的可见候选窗口；是否推荐还需要叠加月光、云量、光污染和地形遮挡。",
                )
            )
        return windows

    def _recommended_milky_way_windows(
        self,
        context: CalculationContext,
        observer,
        candidates: list[MilkyWayCandidateWindow],
        moonless_windows: list[MoonlessNightWindow],
    ) -> list[RecommendedMilkyWayWindow]:
        windows: list[RecommendedMilkyWayWindow] = []

        for candidate in candidates:
            matching_moonless = [item for item in moonless_windows if item.date == candidate.date]
            for moonless in matching_moonless:
                start = max(
                    parse_local_iso(candidate.start, context.timezone),
                    parse_local_iso(moonless.start, context.timezone),
                )
                end = min(
                    parse_local_iso(candidate.end, context.timezone),
                    parse_local_iso(moonless.end, context.timezone),
                )
                if duration_minutes(start, end) < MINIMUM_WINDOW_MINUTES:
                    continue
                samples = self._galactic_center_samples(
                    context, observer, start, end, timedelta(minutes=GALACTIC_CENTER_STEP_MINUTES)
                )
                if not samples:
                    continue
                best = max(samples, key=lambda sample: sample.altitude)
                max_altitude = max(sample.altitude for sample in samples)
                if max_altitude < 15:
                    continue
                moon_impact = self._moon_impact_for_window(context, observer, start, end)
                if moon_impact_level(moon_impact) == "high":
                    continue
                limitations = ["天气数据仍需出行前复核真实云量和能见度。"]
                if max_altitude < 25:
                    limitations.append("银心高度未达到 25°，地景遮挡和低空透明度会更关键。")
                windows.append(
                    RecommendedMilkyWayWindow(
                        date=candidate.date,
                        start=format_local_iso(start),
                        end=format_local_iso(end),
                        bestTime=format_local_iso(best.timestamp),
                        durationMinutes=duration_minutes(start, end),
                        directionZh=direction_from_azimuth(best.azimuth),
                        bestAzimuth=round1(best.azimuth),
                        moonImpactLevel=moon_impact_level(moon_impact),
                        galacticCenterMaxAltitude=round1(max_altitude),
                        reasonZh="该窗口同时位于天文黑夜、低月光影响窗口和银心有效高度候选窗口内。",
                        limitationsZh=limitations,
                    )
                )

        return sorted(windows, key=lambda item: parse_local_iso(item.start, context.timezone))

    def _moon_altitude_samples(
        self,
        context: CalculationContext,
        observer,
        start: datetime,
        end: datetime,
        step: timedelta,
    ) -> list[MoonAltitudeSample]:
        samples: list[MoonAltitudeSample] = []
        cursor = align_to_hour(start) if step >= timedelta(hours=1) else start
        if cursor < start:
            cursor += step
        while cursor < end:
            horizontal = self._horizontal(context, observer, self.moon, cursor)
            samples.append(
                MoonAltitudeSample(
                    time=format_local_iso(cursor),
                    altitude=round1(horizontal.altitude),
                    azimuth=round1(horizontal.azimuth),
                )
            )
            cursor += step
        return samples

    def _moon_impact_for_daily_window(
        self,
        context: CalculationContext,
        observer,
        night: AstronomicalNightWindow | None,
        illumination: float,
    ) -> tuple[float, list[str]]:
        if night is None:
            return 45, ["缺少完整天文黑夜窗口，月光影响按中等风险保守处理。"]
        start = parse_local_iso(night.start, context.timezone)
        end = parse_local_iso(night.end, context.timezone)
        score = self._moon_impact_for_window(context, observer, start, end)
        reasons = moon_impact_reasons(score, illumination)
        return score, reasons

    def _moon_impact_for_window(
        self, context: CalculationContext, observer, start: datetime, end: datetime
    ) -> float:
        scores: list[float] = []
        cursor = start
        while cursor <= end:
            moon = self._horizontal(context, observer, self.moon, cursor)
            illumination = self._moon_illumination(context, cursor)
            scores.append(moon_impact_score(illumination, moon.altitude))
            cursor += timedelta(minutes=MOON_IMPACT_STEP_MINUTES)
        return max(scores) if scores else 45

    def _is_moonless(self, context: CalculationContext, observer, moment: datetime) -> bool:
        moon = self._horizontal(context, observer, self.moon, moment)
        illumination = self._moon_illumination(context, moment)
        if moon.altitude <= 0:
            return True
        if illumination >= 0.2:
            return False
        return moon_impact_score(illumination, moon.altitude) <= 32

    def _galactic_center_samples(
        self,
        context: CalculationContext,
        observer,
        start: datetime,
        end: datetime,
        step: timedelta,
    ) -> list[AltitudeSample]:
        samples: list[AltitudeSample] = []
        cursor = start
        while cursor <= end:
            center = self._horizontal(context, observer, self.galactic_center, cursor)
            moon = self._horizontal(context, observer, self.moon, cursor)
            illumination = self._moon_illumination(context, cursor)
            samples.append(
                AltitudeSample(
                    timestamp=cursor,
                    altitude=center.altitude,
                    azimuth=center.azimuth,
                    moon_impact_score=moon_impact_score(illumination, moon.altitude),
                )
            )
            cursor += step
        return samples

    def _moon_phase(self, context: CalculationContext, moment: datetime) -> tuple[float, float]:
        cache_key = time_cache_key(moment)
        cached = context.moon_phase_cache.get(cache_key)
        if cached is not None:
            return cached
        phase_angle = almanac.moon_phase(self.ephemeris, self._time(context, moment))
        degrees = phase_angle.degrees % 360
        result = (degrees / 360, degrees)
        context.moon_phase_cache[cache_key] = result
        return result

    def _moon_illumination(self, context: CalculationContext, moment: datetime) -> float:
        cache_key = time_cache_key(moment)
        cached = context.moon_illumination_cache.get(cache_key)
        if cached is not None:
            return cached
        illumination = float(
            almanac.fraction_illuminated(self.ephemeris, "moon", self._time(context, moment))
        )
        context.moon_illumination_cache[cache_key] = illumination
        return illumination

    def _solar_noon(
        self, context: CalculationContext, observer, start: datetime, end: datetime
    ) -> datetime | None:
        best_time: datetime | None = None
        best_altitude = -90.0
        cursor = start
        step = timedelta(minutes=SOLAR_NOON_STEP_MINUTES)
        while cursor < end:
            altitude = self._horizontal(context, observer, self.sun, cursor).altitude
            if altitude > best_altitude:
                best_altitude = altitude
                best_time = cursor
            cursor += step
        return best_time

    def _first_crossing(
        self,
        context: CalculationContext,
        observer,
        body,
        start: datetime,
        end: datetime,
        threshold: float,
        direction: str,
    ) -> datetime | None:
        crossings = self._crossings(context, observer, body, start, end, threshold, direction)
        return crossings[0] if crossings else None

    def _crossings(
        self,
        context: CalculationContext,
        observer,
        body,
        start: datetime,
        end: datetime,
        threshold: float,
        direction: str,
    ) -> list[datetime]:
        step = timedelta(minutes=SUN_CROSSING_STEP_MINUTES)
        crossings: list[datetime] = []
        previous_time = start
        previous_value = (
            self._horizontal(context, observer, body, previous_time).altitude - threshold
        )
        cursor = start + step
        while cursor <= end:
            current_value = (
                self._horizontal(context, observer, body, cursor).altitude - threshold
            )
            if previous_value == 0 or previous_value * current_value <= 0:
                rising = current_value > previous_value
                if (direction == "rising" and rising) or (direction == "setting" and not rising):
                    crossings.append(
                        self._bisect_altitude_crossing(
                            context,
                            observer,
                            body,
                            previous_time,
                            cursor,
                            threshold,
                        )
                    )
            previous_time = cursor
            previous_value = current_value
            cursor += step
        return crossings

    def _bisect_altitude_crossing(
        self,
        context: CalculationContext,
        observer,
        body,
        left: datetime,
        right: datetime,
        threshold: float,
    ) -> datetime:
        left_value = self._horizontal(context, observer, body, left).altitude - threshold
        for _ in range(32):
            middle = midpoint(left, right)
            middle_value = self._horizontal(context, observer, body, middle).altitude - threshold
            if abs((right - left).total_seconds()) <= 1:
                return middle
            if left_value * middle_value <= 0:
                right = middle
            else:
                left = middle
                left_value = middle_value
        return midpoint(left, right)

    def _boolean_segments(
        self,
        start: datetime,
        end: datetime,
        step: timedelta,
        predicate,
    ) -> list[tuple[datetime, datetime]]:
        segments: list[tuple[datetime, datetime]] = []
        cursor = start
        previous_time = start
        previous_value = predicate(start)
        active_start = start if previous_value else None
        cursor += step
        while cursor <= end:
            current_value = predicate(cursor)
            if current_value != previous_value:
                boundary = self._bisect_boolean_boundary(previous_time, cursor, predicate)
                if current_value:
                    active_start = boundary
                elif active_start is not None:
                    segments.append((active_start, boundary))
                    active_start = None
            previous_time = cursor
            previous_value = current_value
            cursor += step
        if active_start is not None:
            segments.append((active_start, end))
        return segments

    def _bisect_boolean_boundary(self, left: datetime, right: datetime, predicate) -> datetime:
        left_value = predicate(left)
        for _ in range(24):
            middle = midpoint(left, right)
            if abs((right - left).total_seconds()) <= 1:
                return middle
            if predicate(middle) == left_value:
                left = middle
            else:
                right = middle
        return midpoint(left, right)

    def _horizontal(
        self, context: CalculationContext, observer, body, moment: datetime
    ) -> HorizontalPosition:
        cache_key = (self._body_cache_key(body), time_cache_key(moment))
        cached = context.horizontal_cache.get(cache_key)
        if cached is not None:
            return cached
        astrometric = observer.at(self._time(context, moment)).observe(body).apparent()
        altitude, azimuth, _distance = astrometric.altaz()
        result = HorizontalPosition(altitude=altitude.degrees, azimuth=azimuth.degrees)
        context.horizontal_cache[cache_key] = result
        return result

    def _time(self, context: CalculationContext, moment: datetime):
        cache_key = time_cache_key(moment)
        cached = context.time_cache.get(cache_key)
        if cached is not None:
            return cached
        result = self.timescale.from_datetime(moment.astimezone(UTC))
        context.time_cache[cache_key] = result
        return result

    def _body_cache_key(self, body) -> str:
        if body is self.sun:
            return "sun"
        if body is self.moon:
            return "moon"
        if body is self.galactic_center:
            return "galactic_center"
        return f"body:{id(body)}"


def build_context(request: AstroCalculateRequest) -> CalculationContext:
    timezone_name = request.timezone or DEFAULT_TIMEZONE
    timezone = get_timezone(timezone_name)
    if request.startDateTime:
        forecast_start = parse_local_iso(request.startDateTime, timezone)
    elif request.targetDate:
        forecast_start = local_midnight(date.fromisoformat(request.targetDate), timezone)
    else:
        forecast_start = datetime.now(timezone)

    forecast_start = forecast_start.astimezone(timezone).replace(microsecond=0)
    forecast_end = forecast_start + horizon_delta(request.horizon)
    target_dates = tuple(iter_target_dates(forecast_start, forecast_end))

    return CalculationContext(
        latitude=request.latitudeWgs84,
        longitude=request.longitudeWgs84,
        elevation_m=request.elevationMeters,
        timezone_name=timezone_name,
        timezone=timezone,
        forecast_start=forecast_start,
        forecast_end=forecast_end,
        target_dates=target_dates,
    )


def time_cache_key(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="microseconds")


def horizon_delta(horizon: str) -> timedelta:
    if horizon == "24h":
        return timedelta(hours=24)
    if horizon == "48h":
        return timedelta(hours=48)
    if horizon == "72h":
        return timedelta(hours=72)
    return timedelta(days=7)


def iter_target_dates(start: datetime, end: datetime) -> list[date]:
    last = end - timedelta(seconds=1)
    cursor = start.date()
    dates: list[date] = []
    while cursor <= last.date():
        dates.append(cursor)
        cursor = cursor + timedelta(days=1)
    return dates


def local_midnight(value: date, timezone: ZoneInfo) -> datetime:
    return datetime.combine(value, time(0, 0), timezone)


def parse_local_iso(value: str, timezone: ZoneInfo | None = None) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    target_timezone = timezone or get_timezone(DEFAULT_TIMEZONE)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=target_timezone)
    return parsed.astimezone(target_timezone)


def format_optional_iso(value: datetime | None) -> str | None:
    return format_local_iso(value) if value else None


def format_local_iso(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat(timespec="seconds")


def duration_minutes(start: datetime, end: datetime) -> int:
    return max(0, round((end - start).total_seconds() / 60))


def midpoint(left: datetime, right: datetime) -> datetime:
    return left + (right - left) / 2


def align_to_hour(value: datetime) -> datetime:
    return value.replace(minute=0, second=0, microsecond=0)


def moon_impact_score(illumination: float, altitude: float) -> float:
    if altitude <= 0:
        return 0
    if illumination > 0.5:
        return clamp(66 + min(28, altitude * 0.8), 0, 100)
    if illumination >= 0.2:
        if altitude >= 25:
            return 62
        if altitude >= 8:
            return 44
        return 28
    if altitude >= 25:
        return 34
    if altitude >= 8:
        return 22
    return 12


def moon_impact_level(score: float) -> str:
    if score >= 65:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def moon_impact_reasons(score: float, illumination: float) -> list[str]:
    if score <= 32:
        if illumination < 0.12:
            return ["月亮照明很低或低于地平线，月光影响较轻。"]
        return ["月亮低于地平线，月光影响较轻。"]
    if illumination > 0.5:
        return ["月亮照明超过 50%，位于地平线上方时会明显压低银河对比度。"]
    if illumination >= 0.2:
        return ["月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。"]
    return ["月亮照明较低，但高度较高时仍需结合拍摄方向判断。"]


def moon_phase_name_zh(phase: float, illumination: float, waxing_or_waning: str) -> str:
    normalized = phase % 1
    distance_to_new = min(normalized, 1 - normalized)
    distance_to_full = abs(normalized - 0.5)
    first_quarter_distance = abs(normalized - 0.25)
    last_quarter_distance = abs(normalized - 0.75)
    if distance_to_new <= 0.035 or illumination <= 0.03:
        return "新月"
    if distance_to_full <= 0.035 or illumination >= 0.97:
        return "满月"
    if first_quarter_distance <= 0.035 and 0.42 <= illumination <= 0.58:
        return "上弦月"
    if last_quarter_distance <= 0.035 and 0.42 <= illumination <= 0.58:
        return "下弦月"
    if waxing_or_waning == "waxing":
        return "娥眉月" if normalized < 0.25 else "盈凸月"
    if waxing_or_waning == "waning":
        return "亏凸月" if normalized < 0.75 else "残月"
    return "娥眉月" if normalized < 0.5 else "残月"


def contiguous_sample_segments(samples: list[AltitudeSample], predicate) -> list[list[AltitudeSample]]:
    segments: list[list[AltitudeSample]] = []
    current: list[AltitudeSample] = []
    for sample in samples:
        if predicate(sample):
            current.append(sample)
        elif current:
            segments.append(current)
            current = []
    if current:
        segments.append(current)
    return segments


def milky_way_confidence(max_altitude: float, duration: int) -> str:
    if max_altitude >= 25 and duration >= 90:
        return "high"
    if max_altitude >= 15 and duration >= 60:
        return "medium"
    return "low"


def direction_from_azimuth(azimuth: float) -> str:
    directions = ["北方", "东北方", "东方", "东南方", "南方", "西南方", "西方", "西北方"]
    index = round((azimuth % 360) / 45) % len(directions)
    return directions[index]


def direction_summary_zh(
    candidates: list[MilkyWayCandidateWindow],
    recommended: list[RecommendedMilkyWayWindow],
) -> str:
    window = recommended[0] if recommended else candidates[0] if candidates else None
    if window is None:
        return "所选范围内银心高度不足或缺少有效天文黑夜，暂不生成银河方向建议。"
    return f"优先面向{window.directionZh}观察银心位置，现场仍需避开光污染方向并复核地形遮挡。"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def round1(value: float) -> float:
    return round(value, 1)


def round3(value: float) -> float:
    return round(value, 3)
