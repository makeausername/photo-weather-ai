from __future__ import annotations

from functools import lru_cache
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query

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
    TerrainDemProfileQueryRequest,
    TerrainDemProfileQueryResponse,
    TerrainDemCoverageStatusResponse,
)
from .responses import Utf8JSONResponse
from .terrain_dem import TerrainDemService, unavailable_response as terrain_dem_unavailable_response
from .terrain_dem_coverage import (
    build_coverage_status,
    bbox_for_center_radius,
    load_active_bounds,
    load_region_config,
    required_tile_ids_for_bbox,
    required_tile_ids_for_coordinates,
    tile_ids_from_region_config,
)
from .timezones import DEFAULT_TIMEZONE, get_timezone


DEFAULT_EPHEMERIS_PATH_TEXT = f"/app/data/{EPHEMERIS_FILE_NAME}"
DEFAULT_EPHEMERIS_PATH = Path(DEFAULT_EPHEMERIS_PATH_TEXT)
DEFAULT_LIGHT_POLLUTION_DATASET_PATH = Path(
    "/app/data/light-pollution/current/light-pollution.cog.tif"
)
DEFAULT_LIGHT_POLLUTION_METADATA_PATH = Path("/app/data/light-pollution/current/metadata.json")
DEFAULT_TERRAIN_DEM_DATASET_PATH = Path("/app/data/terrain-dem/current/terrain-dem.cog.tif")
DEFAULT_TERRAIN_DEM_METADATA_PATH = Path("/app/data/terrain-dem/current/metadata.json")
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
TERRAIN_DEM_DATASET_PATH = resolve_absolute_path_env(
    "TERRAIN_DEM_DATASET_PATH",
    DEFAULT_TERRAIN_DEM_DATASET_PATH,
)
TERRAIN_DEM_METADATA_PATH = resolve_absolute_path_env(
    "TERRAIN_DEM_METADATA_PATH",
    DEFAULT_TERRAIN_DEM_METADATA_PATH,
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


@lru_cache(maxsize=1)
def get_terrain_dem_service() -> TerrainDemService:
    return TerrainDemService(TERRAIN_DEM_DATASET_PATH, TERRAIN_DEM_METADATA_PATH)


@app.on_event("shutdown")
def shutdown_services() -> None:
    get_light_pollution_service().close()
    get_terrain_dem_service().close()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    ephemeris_available = EPHEMERIS_PATH.exists()
    timezone_available = True
    try:
        get_timezone(DEFAULT_TIMEZONE)
    except HTTPException:
        timezone_available = False
    light_pollution_health = get_light_pollution_service().health_state()
    terrain_dem_health = get_terrain_dem_service().health_state()
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
        terrainDemAvailable=terrain_dem_health.available,
        terrainDemDatasetPathConfigured=terrain_dem_health.dataset_path_configured,
        terrainDemDatasetExists=terrain_dem_health.dataset_exists,
        terrainDemMetadataAvailable=terrain_dem_health.metadata_available,
        terrainDemDatasetName=terrain_dem_health.dataset_name,
        terrainDemDatasetYear=terrain_dem_health.dataset_year,
        terrainDemDatasetVersion=terrain_dem_health.dataset_version,
        terrainDemChecksumShort=terrain_dem_health.checksum_short,
        terrainDemHealthStatus=terrain_dem_health.health_status,
        terrainDemLoadError=terrain_dem_health.load_error,
    )


@app.post("/light-pollution/query", response_model=LightPollutionQueryResponse)
def query_light_pollution(request: LightPollutionQueryRequest) -> LightPollutionQueryResponse:
    response = get_light_pollution_service().query(request)
    logger.info(
        "light pollution query completed",
        extra=light_pollution_log_payload(request, response, route="/light-pollution/query"),
    )
    return response


@app.post("/terrain-dem/profile", response_model=TerrainDemProfileQueryResponse)
def query_terrain_dem_profile(
    request: TerrainDemProfileQueryRequest,
) -> TerrainDemProfileQueryResponse:
    response = get_terrain_dem_service().query_profile(request)
    logger.info(
        "terrain DEM profile query completed",
        extra=terrain_dem_log_payload(request, response, route="/terrain-dem/profile"),
    )
    return response


@app.get("/terrain-dem/coverage", response_model=TerrainDemCoverageStatusResponse)
def terrain_dem_coverage(
    latitudeWgs84: float | None = None,
    longitudeWgs84: float | None = None,
    radiusKm: float | None = None,
    minLatitude: float | None = None,
    minLongitude: float | None = None,
    maxLatitude: float | None = None,
    maxLongitude: float | None = None,
    coordinate: list[str] | None = Query(default=None),
    region: str | None = None,
    datasetKey: str = "copernicus-dem-glo-90",
) -> TerrainDemCoverageStatusResponse:
    coordinates = parse_coordinate_query_values(coordinate or [])
    tile_ids: set[str] = set()

    if latitudeWgs84 is not None or longitudeWgs84 is not None:
        if latitudeWgs84 is None or longitudeWgs84 is None:
            raise HTTPException(
                status_code=400,
                detail="latitudeWgs84 and longitudeWgs84 must be supplied together",
            )
        coordinates.append((latitudeWgs84, longitudeWgs84))
        if radiusKm is not None:
            south, west, north, east = bbox_for_center_radius(
                latitude=latitudeWgs84,
                longitude=longitudeWgs84,
                radius_km=radiusKm,
            )
            tile_ids.update(
                required_tile_ids_for_bbox(
                    south=south,
                    west=west,
                    north=north,
                    east=east,
                    dataset_key=datasetKey,
                )
            )
        else:
            tile_ids.update(
                required_tile_ids_for_coordinates(
                    [(latitudeWgs84, longitudeWgs84)],
                    dataset_key=datasetKey,
                )
            )

    bbox_values = [minLatitude, minLongitude, maxLatitude, maxLongitude]
    if any(value is not None for value in bbox_values):
        if any(value is None for value in bbox_values):
            raise HTTPException(
                status_code=400,
                detail="bbox requires minLatitude, minLongitude, maxLatitude, and maxLongitude",
            )
        tile_ids.update(
            required_tile_ids_for_bbox(
                south=minLatitude,  # type: ignore[arg-type]
                west=minLongitude,  # type: ignore[arg-type]
                north=maxLatitude,  # type: ignore[arg-type]
                east=maxLongitude,  # type: ignore[arg-type]
                dataset_key=datasetKey,
            )
        )

    if coordinates:
        tile_ids.update(required_tile_ids_for_coordinates(coordinates, dataset_key=datasetKey))

    if region:
        config = load_region_config(region, data_dir=TERRAIN_DEM_DATASET_PATH.parent.parent)
        tile_ids.update(tile_ids_from_region_config(config, dataset_key=datasetKey))

    return build_coverage_status(
        required_tile_ids=tile_ids,
        coordinates=coordinates,
        data_dir=TERRAIN_DEM_DATASET_PATH.parent.parent,
        active_bounds=load_active_bounds(TERRAIN_DEM_METADATA_PATH),
        dataset_key=datasetKey,
    )


@app.post("/astro/calculate", response_model=AstroCalculateResponse)
def calculate(request: AstroCalculateRequest) -> AstroCalculateResponse:
    try:
        get_timezone(request.timezone or DEFAULT_TIMEZONE)
        response = get_calculator().calculate(request)
        response.lightPollution = calculate_light_pollution_for_astro_request(request, response)
        terrain_dem_profile = calculate_terrain_dem_for_astro_request(request, response)
        logger.info(
            "astro calculation completed",
            extra={
                "computeElapsedMs": response.calculationBasis.computeElapsedMs,
                "horizon": request.horizon,
                "targetDates": len(response.targetDates),
                "lightPollutionAvailable": response.lightPollution.available,
                "lightPollutionDatasetVersion": response.lightPollution.datasetVersion,
                "terrainDemAvailable": terrain_dem_profile.available,
                "terrainDemDatasetVersion": terrain_dem_profile.datasetVersion,
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


def calculate_terrain_dem_for_astro_request(
    request: AstroCalculateRequest,
    response: AstroCalculateResponse,
) -> TerrainDemProfileQueryResponse:
    target_azimuth, target_altitude = first_milky_way_target_geometry(response)
    query = TerrainDemProfileQueryRequest(
        latitudeWgs84=request.latitudeWgs84,
        longitudeWgs84=request.longitudeWgs84,
        observerElevationMeters=request.elevationMeters,
        target="milky_way",
        targetAzimuthDegrees=target_azimuth,
        targetAltitudeDegrees=target_altitude,
    )
    try:
        terrain_dem = get_terrain_dem_service().query_profile(query)
    except Exception as exc:  # pragma: no cover - defensive guard for optional raster failures.
        logger.warning(
            "terrain DEM query failed during astro calculation",
            extra={
                "route": "/astro/calculate",
                "latitudeRounded": round(request.latitudeWgs84, 3),
                "longitudeRounded": round(request.longitudeWgs84, 3),
                "targetAzimuthDegrees": target_azimuth,
                "errorName": type(exc).__name__,
                "errorMessage": str(exc),
            },
        )
        terrain_dem = terrain_dem_unavailable_response(
            "terrain_dem_unreadable",
            request=query,
            load_error=f"{type(exc).__name__}:{exc}",
        )
    logger.info(
        "terrain DEM profile query completed",
        extra=terrain_dem_log_payload(query, terrain_dem, route="/astro/calculate"),
    )
    return terrain_dem


def first_milky_way_target_azimuth(response: AstroCalculateResponse) -> float | None:
    for window in response.milkyWay.recommendedWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth
    for window in response.milkyWay.candidateWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth
    return None


def first_milky_way_target_geometry(response: AstroCalculateResponse) -> tuple[float | None, float | None]:
    for window in response.milkyWay.recommendedWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth, window.galacticCenterMaxAltitude
    for window in response.milkyWay.candidateWindows:
        if window.bestAzimuth is not None:
            return window.bestAzimuth, window.maxAltitude
    return None, None


def parse_coordinate_query_values(values: list[str]) -> list[tuple[float, float]]:
    coordinates: list[tuple[float, float]] = []
    for value in values:
        parts = [part.strip() for part in value.split(",")]
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="coordinate values must be LAT,LON")
        try:
            coordinates.append((float(parts[0]), float(parts[1])))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="coordinate values must be numeric") from exc
    return coordinates


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


def terrain_dem_log_payload(
    request: TerrainDemProfileQueryRequest,
    response: TerrainDemProfileQueryResponse,
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
        "targetAzimuthDegrees": request.targetAzimuthDegrees,
        "targetAltitudeDegrees": request.targetAltitudeDegrees,
        "validSampleCount": response.validSampleCount,
        "sampleCount": response.sampleCount,
        "horizonAltitudeDegrees": response.horizonAltitudeDegrees,
        "obstructionLevel": response.obstructionLevel,
        "unavailableReason": response.unavailableReason,
    }
