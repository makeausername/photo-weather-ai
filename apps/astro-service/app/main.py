from __future__ import annotations

from functools import lru_cache
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .calculator import (
    EPHEMERIS_FILE_NAME,
    AstronomyCalculator,
    EphemerisLoadError,
    EphemerisMissingError,
)
from .light_pollution import LightPollutionService, unavailable_response
from .models import (
    AstroCalculateRequest,
    AstroCalculateResponse,
    HealthResponse,
    LightPollutionQueryRequest,
    LightPollutionQueryResponse,
)
from .responses import Utf8JSONResponse
from .timezones import DEFAULT_TIMEZONE, get_timezone


DEFAULT_EPHEMERIS_PATH_TEXT = f"/app/data/{EPHEMERIS_FILE_NAME}"
DEFAULT_EPHEMERIS_PATH = Path(DEFAULT_EPHEMERIS_PATH_TEXT)
DEFAULT_LIGHT_POLLUTION_DATASET_PATH = Path(
    "/app/data/light-pollution/current/light-pollution.cog.tif"
)
DEFAULT_LIGHT_POLLUTION_METADATA_PATH = Path("/app/data/light-pollution/current/metadata.json")
logger = logging.getLogger("astro-service")


def resolve_ephemeris_path() -> Path:
    configured_path = os.environ.get("EPHEMERIS_PATH", "").strip()
    if not configured_path:
        return DEFAULT_EPHEMERIS_PATH

    path = Path(configured_path)
    if not path.is_absolute():
        logger.warning("Ignoring relative EPHEMERIS_PATH; using default absolute path")
        return DEFAULT_EPHEMERIS_PATH

    return path


def resolve_absolute_path_env(env_name: str, default_path: Path) -> Path:
    configured_path = os.environ.get(env_name, "").strip()
    if not configured_path:
        return default_path
    path = Path(configured_path)
    if not path.is_absolute():
        logger.warning("Ignoring relative %s; using default absolute path", env_name)
        return default_path
    return path


def resolve_light_pollution_cache_size() -> int:
    raw_value = os.environ.get("LIGHT_POLLUTION_CACHE_SIZE", "1024").strip()
    try:
        return max(0, int(raw_value))
    except ValueError:
        logger.warning("Ignoring invalid LIGHT_POLLUTION_CACHE_SIZE; using 1024")
        return 1024


def resolve_light_pollution_query_timeout_ms() -> int:
    raw_value = os.environ.get("LIGHT_POLLUTION_QUERY_TIMEOUT_MS", "5000").strip()
    try:
        return max(1, int(raw_value))
    except ValueError:
        logger.warning("Ignoring invalid LIGHT_POLLUTION_QUERY_TIMEOUT_MS; using 5000")
        return 5000


EPHEMERIS_PATH = resolve_ephemeris_path()
LIGHT_POLLUTION_DATASET_PATH = resolve_absolute_path_env(
    "LIGHT_POLLUTION_DATASET_PATH",
    DEFAULT_LIGHT_POLLUTION_DATASET_PATH,
)
LIGHT_POLLUTION_METADATA_PATH = resolve_absolute_path_env(
    "LIGHT_POLLUTION_METADATA_PATH",
    DEFAULT_LIGHT_POLLUTION_METADATA_PATH,
)
LIGHT_POLLUTION_QUERY_TIMEOUT_MS = resolve_light_pollution_query_timeout_ms()


def format_ephemeris_path(path: Path) -> str:
    if path == DEFAULT_EPHEMERIS_PATH:
        return DEFAULT_EPHEMERIS_PATH_TEXT
    return str(path)


app = FastAPI(
    title="逐光天气本地天文计算服务",
    version="0.1.0",
    default_response_class=Utf8JSONResponse,
)


@lru_cache(maxsize=1)
def get_calculator() -> AstronomyCalculator:
    return AstronomyCalculator(EPHEMERIS_PATH)


@lru_cache(maxsize=1)
def get_light_pollution_service() -> LightPollutionService:
    return LightPollutionService(
        LIGHT_POLLUTION_DATASET_PATH,
        LIGHT_POLLUTION_METADATA_PATH,
        cache_size=resolve_light_pollution_cache_size(),
    )


@app.on_event("shutdown")
def shutdown_services() -> None:
    get_light_pollution_service().close()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    ephemeris_available = EPHEMERIS_PATH.exists()
    timezone_available = True
    try:
        get_timezone(DEFAULT_TIMEZONE)
    except HTTPException:
        timezone_available = False
    light_pollution_health = get_light_pollution_service().health_state()
    return HealthResponse(
        ok=ephemeris_available and timezone_available,
        service="astro-service",
        ephemerisAvailable=ephemeris_available,
        ephemerisFileName=EPHEMERIS_FILE_NAME,
        ephemerisPath=format_ephemeris_path(EPHEMERIS_PATH),
        timezoneAvailable=timezone_available,
        defaultTimezone=DEFAULT_TIMEZONE,
        lightPollutionAvailable=light_pollution_health.available,
        lightPollutionDatasetPathConfigured=light_pollution_health.dataset_path_configured,
        lightPollutionMetadataAvailable=light_pollution_health.metadata_available,
        lightPollutionDatasetYear=light_pollution_health.dataset_year,
        lightPollutionDatasetVersion=light_pollution_health.dataset_version,
        lightPollutionChecksumShort=light_pollution_health.checksum_short,
        lightPollutionLoadError=light_pollution_health.load_error,
    )


@app.post("/light-pollution/query", response_model=LightPollutionQueryResponse)
def query_light_pollution(request: LightPollutionQueryRequest) -> LightPollutionQueryResponse:
    response = get_light_pollution_service().query(request)
    logger.info(
        "light pollution query completed",
        extra=light_pollution_log_payload(request, response, route="/light-pollution/query"),
    )
    return response


@app.post("/astro/calculate", response_model=AstroCalculateResponse)
def calculate(request: AstroCalculateRequest) -> AstroCalculateResponse:
    try:
        get_timezone(request.timezone or DEFAULT_TIMEZONE)
        response = get_calculator().calculate(request)
        response.lightPollution = calculate_light_pollution_for_astro_request(request, response)
        logger.info(
            "astro calculation completed",
            extra={
                "computeElapsedMs": response.calculationBasis.computeElapsedMs,
                "horizon": request.horizon,
                "targetDates": len(response.targetDates),
                "lightPollutionAvailable": response.lightPollution.available,
                "lightPollutionDatasetVersion": response.lightPollution.datasetVersion,
            },
        )
        return response
    except EphemerisMissingError as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "本地星历文件缺失，无法生成精确的星空银河窗口。"
                "请执行 bash scripts/download-ephemeris.sh 后重试。"
            ),
        ) from error
    except EphemerisLoadError as error:
        raise HTTPException(
            status_code=503,
            detail="本地星历文件无法读取，请检查文件完整性和权限。",
        ) from error


def calculate_light_pollution_for_astro_request(
    request: AstroCalculateRequest,
    response: AstroCalculateResponse,
) -> LightPollutionQueryResponse:
    target_azimuth = first_milky_way_target_azimuth(response)
    query = LightPollutionQueryRequest(
        latitudeWgs84=request.latitudeWgs84,
        longitudeWgs84=request.longitudeWgs84,
        observerElevationMeters=request.elevationMeters,
        targetAzimuthDegrees=target_azimuth,
        timezone=request.timezone or DEFAULT_TIMEZONE,
    )
    try:
        light_pollution = get_light_pollution_service().query(query)
    except Exception as exc:  # pragma: no cover - defensive guard for optional raster failures.
        logger.warning(
            "light pollution query failed during astro calculation",
            extra={
                "route": "/astro/calculate",
                "latitudeRounded": round(request.latitudeWgs84, 3),
                "longitudeRounded": round(request.longitudeWgs84, 3),
                "targetAzimuthDegrees": target_azimuth,
                "errorName": type(exc).__name__,
                "errorMessage": str(exc),
            },
        )
        light_pollution = unavailable_response("query_failed")
    logger.info(
        "light pollution query completed",
        extra=light_pollution_log_payload(query, light_pollution, route="/astro/calculate"),
    )
    return light_pollution


def first_milky_way_target_azimuth(response: AstroCalculateResponse) -> float | None:
    for window in response.milkyWay.recommendedWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth
    for window in response.milkyWay.candidateWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth
    return None


def light_pollution_log_payload(
    request: LightPollutionQueryRequest,
    response: LightPollutionQueryResponse,
    *,
    route: str,
) -> dict[str, object]:
    return {
        "route": route,
        "available": response.available,
        "datasetVersion": response.datasetVersion,
        "datasetYear": response.datasetYear,
        "queryElapsedMs": response.queryElapsedMs,
        "latitudeRounded": round(request.latitudeWgs84, 3),
        "longitudeRounded": round(request.longitudeWgs84, 3),
        "validSampleCount": response.validSampleCount,
        "ambientRiskIndex": response.ambientRiskIndex,
        "targetDirectionRisk": response.targetDirectionRisk,
        "cacheHit": response.cacheHit,
        "unavailableReason": response.unavailableReason,
    }
