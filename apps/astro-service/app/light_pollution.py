from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
import json
import math
from statistics import median
from threading import RLock
from time import perf_counter
from typing import Any

try:
    import numpy as np
    import rasterio
    from pyproj import Geod
    from rasterio.errors import RasterioIOError
except Exception as exc:  # pragma: no cover - exercised when optional deps are absent.
    np = None  # type: ignore[assignment]
    rasterio = None  # type: ignore[assignment]
    Geod = None  # type: ignore[assignment]
    RasterioIOError = Exception  # type: ignore[assignment]
    RASTER_DEPENDENCY_ERROR: Exception | None = exc
else:
    RASTER_DEPENDENCY_ERROR = None

from .models import (
    DirectionalLightPollutionRisk,
    LightPollutionCalculationBasis,
    LightPollutionQueryRequest,
    LightPollutionQueryResponse,
    LightPollutionRiskLevel,
)


SAMPLING_CONFIG_VERSION = "satellite-night-light-v1"
LOCAL_NEIGHBORHOOD_KM = [0.0, 0.5, 1.5]
RING_DISTANCES_KM = [5.0, 15.0, 30.0, 60.0]
DISTANCE_WEIGHTS = {
    "local": 0.45,
    "5km": 0.22,
    "15km": 0.16,
    "30km": 0.11,
    "60km": 0.06,
}
DIRECTION_SECTOR_DEGREES = 45
RADIANCE_EPSILON = 0.001
QUANTILE_BASIS = "adaptive_positive_log_radiance_quantiles"
CALIBRATION_LOW_QUANTILE_ORDER = ("p05", "p10", "p25", "p50")
CALIBRATION_HIGH_QUANTILE_ORDER = ("p95", "p90", "p99")
DEFAULT_UNAVAILABLE_NOTE_ZH = (
    "光污染数据暂缺；未按无光污染处理，需现场确认城市光穹与地平线环境。"
)
NON_SQM_BORTLE_NOTICE_ZH = (
    "该结果为卫星夜光参考，不是现场SQM实测，也不代表测量Bortle等级。"
)

DIRECTIONS: tuple[tuple[str, str, float], ...] = (
    ("north", "北", 0.0),
    ("northeast", "东北", 45.0),
    ("east", "东", 90.0),
    ("southeast", "东南", 135.0),
    ("south", "南", 180.0),
    ("southwest", "西南", 225.0),
    ("west", "西", 270.0),
    ("northwest", "西北", 315.0),
)


@dataclass(frozen=True)
class DatasetSignature:
    checksum_short: str | None
    dataset_mtime_ns: int
    metadata_mtime_ns: int

    def cache_token(self) -> str:
        return f"{self.checksum_short or 'no-checksum'}:{self.dataset_mtime_ns}:{self.metadata_mtime_ns}"


@dataclass(frozen=True)
class SampledValue:
    value: float | None
    sample_count: int
    valid_sample_count: int


@dataclass(frozen=True)
class HealthState:
    available: bool
    dataset_path_configured: bool
    metadata_available: bool
    dataset_year: int | None
    dataset_version: str | None
    checksum_short: str | None
    load_error: str | None


@dataclass(frozen=True)
class CalibrationBounds:
    low: float
    high: float
    low_quantile: str
    high_quantile: str
    quantile_source: str


class LightPollutionDataset:
    def __init__(self, dataset_path: Path, metadata_path: Path) -> None:
        self.dataset_path = dataset_path
        self.metadata_path = metadata_path
        self._lock = RLock()
        self._dataset: Any | None = None
        self._metadata: dict[str, Any] | None = None
        self._signature: DatasetSignature | None = None
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def metadata(self) -> dict[str, Any] | None:
        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            return dict(self._metadata) if self._metadata else None

    @property
    def signature(self) -> DatasetSignature | None:
        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            return self._signature

    def close(self) -> None:
        with self._lock:
            if self._dataset is not None:
                self._dataset.close()
            self._dataset = None
            self._metadata = None
            self._signature = None

    def health_state(self) -> HealthState:
        if RASTER_DEPENDENCY_ERROR is not None:
            return HealthState(
                available=False,
                dataset_path_configured=bool(str(self.dataset_path)),
                metadata_available=self.metadata_path.exists(),
                dataset_year=None,
                dataset_version=None,
                checksum_short=None,
                load_error=f"dependency_missing:{RASTER_DEPENDENCY_ERROR}",
            )

        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            metadata = self._metadata or read_metadata_file(self.metadata_path)
            checksum = checksum_short_from_metadata(metadata)
            return HealthState(
                available=self._dataset is not None and self._load_error is None,
                dataset_path_configured=bool(str(self.dataset_path)),
                metadata_available=self.metadata_path.exists(),
                dataset_year=safe_int(metadata.get("datasetYear") if metadata else None),
                dataset_version=safe_str(metadata.get("datasetVersion") if metadata else None),
                checksum_short=checksum,
                load_error=self._load_error,
            )

    def open(self):
        with self._lock:
            self._ensure_open_locked(raise_on_error=True)
            return self._dataset

    def _ensure_open_locked(self, *, raise_on_error: bool) -> None:
        if RASTER_DEPENDENCY_ERROR is not None:
            self._load_error = f"dependency_missing:{RASTER_DEPENDENCY_ERROR}"
            if raise_on_error:
                raise RuntimeError(self._load_error)
            return

        if not self.dataset_path.exists():
            self._reset_open_state("dataset_missing")
            return
        if not self.metadata_path.exists():
            self._reset_open_state("metadata_missing")
            return

        signature = self._current_signature()
        if self._dataset is not None and self._signature == signature:
            return

        if self._dataset is not None:
            self._dataset.close()
            self._dataset = None

        try:
            metadata = read_metadata_file(self.metadata_path)
            dataset = rasterio.open(self.dataset_path)  # type: ignore[union-attr]
            if dataset.count < 1:
                raise RuntimeError("dataset_has_no_band")
            if dataset.width <= 0 or dataset.height <= 0:
                raise RuntimeError("dataset_has_invalid_dimensions")
            if dataset.crs is None or dataset.crs.to_epsg() != 4326:
                raise RuntimeError("dataset_crs_is_not_epsg4326")
            self._metadata = metadata
            self._dataset = dataset
            self._signature = signature
            self._load_error = None
        except (RasterioIOError, OSError, RuntimeError, json.JSONDecodeError) as exc:
            self._reset_open_state(f"{type(exc).__name__}:{exc}")
            if raise_on_error:
                raise

    def _current_signature(self) -> DatasetSignature:
        dataset_stat = self.dataset_path.stat()
        metadata_stat = self.metadata_path.stat()
        metadata = read_metadata_file(self.metadata_path)
        return DatasetSignature(
            checksum_short=checksum_short_from_metadata(metadata),
            dataset_mtime_ns=dataset_stat.st_mtime_ns,
            metadata_mtime_ns=metadata_stat.st_mtime_ns,
        )

    def _reset_open_state(self, error: str) -> None:
        if self._dataset is not None:
            self._dataset.close()
        self._dataset = None
        self._metadata = None
        self._signature = None
        self._load_error = error


class LightPollutionService:
    def __init__(self, dataset_path: Path, metadata_path: Path, cache_size: int = 1024) -> None:
        self.dataset = LightPollutionDataset(dataset_path, metadata_path)
        self.cache_size = max(0, cache_size)
        self._cache: OrderedDict[tuple[Any, ...], LightPollutionQueryResponse] = OrderedDict()
        self._lock = RLock()
        self._geod = Geod(ellps="WGS84") if Geod is not None else None

    def close(self) -> None:
        self.dataset.close()
        with self._lock:
            self._cache.clear()

    def health_state(self) -> HealthState:
        return self.dataset.health_state()

    def query(self, request: LightPollutionQueryRequest) -> LightPollutionQueryResponse:
        started_at = perf_counter()
        if RASTER_DEPENDENCY_ERROR is not None:
            return unavailable_response(
                "dependency_missing",
                query_elapsed_ms=elapsed_ms(started_at),
                load_error=str(RASTER_DEPENDENCY_ERROR),
            )
        if not valid_coordinate(request.latitudeWgs84, request.longitudeWgs84):
            return unavailable_response("invalid_coordinate", query_elapsed_ms=elapsed_ms(started_at))

        signature = self.dataset.signature
        if signature is None:
            return unavailable_response(
                self.dataset.load_error or "dataset_missing",
                query_elapsed_ms=elapsed_ms(started_at),
            )

        cache_key = (
            round(request.latitudeWgs84, 5),
            round(request.longitudeWgs84, 5),
            round(request.targetAzimuthDegrees % 360, 1)
            if request.targetAzimuthDegrees is not None
            else None,
            signature.cache_token(),
            SAMPLING_CONFIG_VERSION,
        )
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.move_to_end(cache_key)
                return cached.model_copy(update={"cacheHit": True, "queryElapsedMs": elapsed_ms(started_at)})

        response = self._query_uncached(request, started_at)
        if response.available and self.cache_size > 0:
            with self._lock:
                self._cache[cache_key] = response.model_copy(update={"cacheHit": False})
                while len(self._cache) > self.cache_size:
                    self._cache.popitem(last=False)
        return response

    def _query_uncached(
        self,
        request: LightPollutionQueryRequest,
        started_at: float,
    ) -> LightPollutionQueryResponse:
        dataset = self.dataset.open()
        metadata = self.dataset.metadata or {}

        if not coordinate_within_bounds(dataset.bounds, request.longitudeWgs84, request.latitudeWgs84):
            return unavailable_response(
                "out_of_dataset_bounds",
                metadata=metadata,
                query_elapsed_ms=elapsed_ms(started_at),
            )

        local_samples = self._sample_local(dataset, request.longitudeWgs84, request.latitudeWgs84)
        direction_samples = [
            self._sample_direction(dataset, request.longitudeWgs84, request.latitudeWgs84, key, label, azimuth)
            for key, label, azimuth in DIRECTIONS
        ]
        sample_count = local_samples.sample_count + sum(item.sample_count for item in direction_samples)
        valid_sample_count = local_samples.valid_sample_count + sum(
            item.valid_sample_count for item in direction_samples
        )

        if valid_sample_count == 0:
            return unavailable_response(
                "no_valid_samples",
                metadata=metadata,
                query_elapsed_ms=elapsed_ms(started_at),
                sample_count=sample_count,
            )

        local_radiance = local_samples.value
        halo_radiance = robust_aggregate(
            [sample.radiance for sample in direction_samples if sample.radiance is not None]
        )
        ambient_radiance = weighted_radiance(
            [
                (local_radiance, DISTANCE_WEIGHTS["local"]),
                (halo_radiance, 1.0 - DISTANCE_WEIGHTS["local"]),
            ]
        )
        ambient_index = risk_index(ambient_radiance, metadata)
        ambient_level, ambient_label = risk_level(ambient_index)
        local_percentile = risk_index(local_radiance, metadata) if local_radiance is not None else None
        directional_risk = [
            build_directional_response(sample, metadata) for sample in direction_samples
        ]
        target_risk = interpolate_target_risk(request.targetAzimuthDegrees, directional_risk)
        target_level, target_label = (
            risk_level(target_risk) if target_risk is not None else (None, None)
        )
        confidence = confidence_from_samples(valid_sample_count, sample_count)
        note = light_pollution_note(ambient_label, target_label)

        return LightPollutionQueryResponse(
            available=True,
            dataAvailable=True,
            sourceCode=safe_str(metadata.get("sourceCode")),
            sourceLabel=safe_str(metadata.get("sourceLabel")),
            datasetYear=safe_int(metadata.get("datasetYear")),
            datasetVersion=safe_str(metadata.get("datasetVersion")),
            checksumShort=checksum_short_from_metadata(metadata),
            localRadiance=round_optional(local_radiance, 4),
            localRadiancePercentile=round_optional(local_percentile, 1),
            surroundingHaloRadiance=round_optional(halo_radiance, 4),
            ambientRiskIndex=ambient_index,
            ambientRiskLevel=ambient_level,
            ambientRiskLevelLabelZh=ambient_label,
            directionalRisk=directional_risk,
            targetAzimuthDegrees=round_optional(request.targetAzimuthDegrees, 1),
            targetDirectionRisk=target_risk,
            targetDirectionLevel=target_level,
            targetDirectionLevelLabelZh=target_label,
            confidence=confidence,
            sampleCount=sample_count,
            validSampleCount=valid_sample_count,
            calculationBasis=calculation_basis(),
            lightPollutionNoteZh=note,
            queryElapsedMs=elapsed_ms(started_at),
            cacheHit=False,
        )

    def _sample_local(self, dataset: Any, lon: float, lat: float) -> SampledValue:
        points: list[tuple[float, float]] = [(lon, lat)]
        for distance_km in LOCAL_NEIGHBORHOOD_KM:
            if distance_km <= 0:
                continue
            for _, _, azimuth in DIRECTIONS:
                points.append(self._project(lon, lat, azimuth, distance_km))
        return sampled_value(dataset, points)

    def _sample_direction(
        self,
        dataset: Any,
        lon: float,
        lat: float,
        key: str,
        label: str,
        azimuth: float,
    ) -> DirectionSample:
        ring_values: list[tuple[float | None, float]] = []
        sample_count = 0
        valid_sample_count = 0
        for distance_km in RING_DISTANCES_KM:
            points = [
                self._project(lon, lat, normalize_azimuth(azimuth + offset), distance_km)
                for offset in (-12.0, 0.0, 12.0)
            ]
            sampled = sampled_value(dataset, points)
            sample_count += sampled.sample_count
            valid_sample_count += sampled.valid_sample_count
            weight = DISTANCE_WEIGHTS[f"{int(distance_km)}km"]
            ring_values.append((sampled.value, weight))
        radiance = weighted_radiance(ring_values)
        return DirectionSample(
            direction=key,
            direction_label_zh=label,
            azimuth_degrees=azimuth,
            radiance=radiance,
            sample_count=sample_count,
            valid_sample_count=valid_sample_count,
        )

    def _project(self, lon: float, lat: float, azimuth: float, distance_km: float) -> tuple[float, float]:
        if self._geod is None:
            return lon, lat
        projected_lon, projected_lat, _ = self._geod.fwd(lon, lat, azimuth, distance_km * 1000)
        return float(projected_lon), float(projected_lat)


@dataclass(frozen=True)
class DirectionSample:
    direction: str
    direction_label_zh: str
    azimuth_degrees: float
    radiance: float | None
    sample_count: int
    valid_sample_count: int


def sampled_value(dataset: Any, points: list[tuple[float, float]]) -> SampledValue:
    values: list[float] = []
    sample_count = 0
    for lon, lat in points:
        sample_count += 1
        if not coordinate_within_bounds(dataset.bounds, lon, lat):
            continue
        try:
            sample = next(dataset.sample([(lon, lat)], indexes=1, masked=True))
        except (StopIteration, RasterioIOError, ValueError):
            continue
        value = masked_sample_value(sample)
        if value is not None:
            values.append(value)
    return SampledValue(
        value=robust_aggregate(values),
        sample_count=sample_count,
        valid_sample_count=len(values),
    )


def masked_sample_value(sample: Any) -> float | None:
    if np is None:
        return None
    array = np.ma.asarray(sample)
    if array.size == 0 or np.ma.is_masked(array[0]):
        return None
    value = float(array[0])
    if not math.isfinite(value):
        return None
    return max(0.0, value)


def robust_aggregate(values: list[float | None]) -> float | None:
    finite = [max(0.0, float(value)) for value in values if value is not None and math.isfinite(value)]
    if not finite:
        return None
    finite.sort()
    med = float(median(finite))
    upper = percentile(finite, 75)
    cap = percentile(finite, 90)
    capped_mean = sum(min(value, cap) for value in finite) / len(finite)
    return 0.45 * med + 0.35 * upper + 0.20 * capped_mean


def weighted_radiance(values: list[tuple[float | None, float]]) -> float | None:
    valid = [(value, weight) for value, weight in values if value is not None and math.isfinite(value)]
    if not valid:
        return None
    total_weight = sum(weight for _, weight in valid)
    if total_weight <= 0:
        return None
    return sum(max(0.0, value) * weight for value, weight in valid) / total_weight


def risk_index(radiance: float | None, metadata: dict[str, Any]) -> int | None:
    if radiance is None or not math.isfinite(radiance):
        return None
    bounds = calibration_bounds(metadata)
    if bounds is None:
        return None
    low, high = bounds
    normalized_radiance = max(0.0, radiance)
    low_log = math.log1p(low + RADIANCE_EPSILON)
    high_log = math.log1p(high + RADIANCE_EPSILON)
    denominator = high_log - low_log
    if denominator <= 0:
        return None
    scaled = (math.log1p(normalized_radiance + RADIANCE_EPSILON) - low_log) / denominator
    return int(max(0, min(100, round(scaled * 100))))


def calibration_bounds(metadata: dict[str, Any]) -> tuple[float, float] | None:
    selected = calibration_bound_selection(metadata)
    if selected is None:
        return None
    return selected.low, selected.high


def calibration_bound_selection(metadata: dict[str, Any]) -> CalibrationBounds | None:
    positive_quantiles = metadata.get("positiveRadianceQuantiles")
    if isinstance(positive_quantiles, dict):
        bounds = adaptive_quantile_bounds(
            positive_quantiles,
            quantile_source="positiveRadianceQuantiles",
        )
        if bounds is not None:
            return bounds

    legacy_quantiles = metadata.get("quantiles")
    if isinstance(legacy_quantiles, dict):
        return adaptive_quantile_bounds(legacy_quantiles, quantile_source="quantiles")
    return None


def adaptive_quantile_bounds(
    quantiles: dict[str, Any],
    *,
    quantile_source: str,
) -> CalibrationBounds | None:
    low_selection = first_positive_quantile(quantiles, CALIBRATION_LOW_QUANTILE_ORDER)
    if low_selection is None:
        return None
    low_key, low = low_selection

    high_selection = first_quantile_greater_than(
        quantiles,
        CALIBRATION_HIGH_QUANTILE_ORDER,
        low,
    )
    if high_selection is None:
        return None
    high_key, high = high_selection

    return CalibrationBounds(
        low=low,
        high=high,
        low_quantile=low_key,
        high_quantile=high_key,
        quantile_source=quantile_source,
    )


def first_positive_quantile(
    quantiles: dict[str, Any],
    candidates: tuple[str, ...],
) -> tuple[str, float] | None:
    for key in candidates:
        value = safe_float(quantiles.get(key))
        if value is not None and value > 0:
            return key, value
    return None


def first_quantile_greater_than(
    quantiles: dict[str, Any],
    candidates: tuple[str, ...],
    low: float,
) -> tuple[str, float] | None:
    for key in candidates:
        value = safe_float(quantiles.get(key))
        if value is not None and value > low:
            return key, value
    return None


def risk_level(index: int | None) -> tuple[LightPollutionRiskLevel, str]:
    if index is None:
        return "insufficient", "数据不足"
    if index < 20:
        return "very_low", "极低"
    if index < 40:
        return "low", "低"
    if index < 60:
        return "medium", "中"
    if index < 80:
        return "high", "高"
    return "very_high", "很高"


def build_directional_response(
    sample: DirectionSample,
    metadata: dict[str, Any],
) -> DirectionalLightPollutionRisk:
    index = risk_index(sample.radiance, metadata)
    level, label = risk_level(index)
    return DirectionalLightPollutionRisk(
        direction=sample.direction,  # type: ignore[arg-type]
        directionLabelZh=sample.direction_label_zh,
        azimuthDegrees=sample.azimuth_degrees,
        radiance=round_optional(sample.radiance, 4),
        riskIndex=index,
        riskLevel=level,
        riskLevelLabelZh=label,
        sampleCount=sample.sample_count,
        validSampleCount=sample.valid_sample_count,
    )


def interpolate_target_risk(
    target_azimuth: float | None,
    directional: list[DirectionalLightPollutionRisk],
) -> int | None:
    if target_azimuth is None:
        return None
    finite = [
        item
        for item in directional
        if item.riskIndex is not None and math.isfinite(item.azimuthDegrees)
    ]
    if len(finite) < 2:
        return None
    azimuth = normalize_azimuth(target_azimuth)
    sectors = sorted((normalize_azimuth(item.azimuthDegrees), item.riskIndex) for item in finite)
    for index, (sector_azimuth, sector_risk) in enumerate(sectors):
        next_azimuth, next_risk = sectors[(index + 1) % len(sectors)]
        span = (next_azimuth - sector_azimuth) % 360
        delta = (azimuth - sector_azimuth) % 360
        if span == 0:
            continue
        if 0 <= delta <= span:
            weight = delta / span
            return int(round(sector_risk * (1 - weight) + next_risk * weight))
    nearest = min(sectors, key=lambda item: abs(((azimuth - item[0] + 180) % 360) - 180))
    return int(nearest[1])


def confidence_from_samples(valid_count: int, sample_count: int) -> str:
    if sample_count <= 0:
        return "low"
    ratio = valid_count / sample_count
    if valid_count >= 70 and ratio >= 0.65:
        return "high"
    if valid_count >= 30 and ratio >= 0.35:
        return "medium"
    return "low"


def light_pollution_note(ambient_label: str, target_label: str | None) -> str:
    if target_label:
        return (
            f"卫星夜光参考：环境光污染{ambient_label}，银河方向光害{target_label}。"
            f"{NON_SQM_BORTLE_NOTICE_ZH}"
        )
    return f"卫星夜光参考：环境光污染{ambient_label}；银河方向角不足，未推断目标方向光害。{NON_SQM_BORTLE_NOTICE_ZH}"


def calculation_basis() -> LightPollutionCalculationBasis:
    return LightPollutionCalculationBasis(
        samplingConfigVersion=SAMPLING_CONFIG_VERSION,
        coordinateSystem="WGS84",
        distancesKm=RING_DISTANCES_KM,
        distanceWeights=DISTANCE_WEIGHTS,
        localNeighborhoodKm=LOCAL_NEIGHBORHOOD_KM,
        directionSectorsDegrees=DIRECTION_SECTOR_DEGREES,
        quantileBasis=QUANTILE_BASIS,
        scoringMode="heuristic",
        nonSqmBortleNoticeZh=NON_SQM_BORTLE_NOTICE_ZH,
    )


def unavailable_response(
    reason: str,
    *,
    metadata: dict[str, Any] | None = None,
    query_elapsed_ms: float | None = None,
    sample_count: int = 0,
    load_error: str | None = None,
) -> LightPollutionQueryResponse:
    metadata = metadata or {}
    note = DEFAULT_UNAVAILABLE_NOTE_ZH
    if load_error:
        reason = f"{reason}:{load_error}"
    return LightPollutionQueryResponse(
        available=False,
        dataAvailable=False,
        unavailableReason=reason,
        sourceCode=safe_str(metadata.get("sourceCode")),
        sourceLabel=safe_str(metadata.get("sourceLabel")),
        datasetYear=safe_int(metadata.get("datasetYear")),
        datasetVersion=safe_str(metadata.get("datasetVersion")),
        checksumShort=checksum_short_from_metadata(metadata),
        ambientRiskLevel="insufficient",
        ambientRiskLevelLabelZh="数据不足",
        directionalRisk=[],
        confidence="low",
        sampleCount=sample_count,
        validSampleCount=0,
        calculationBasis=calculation_basis(),
        lightPollutionNoteZh=note,
        queryElapsedMs=query_elapsed_ms,
        cacheHit=False,
    )


def read_metadata_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        content = json.load(handle)
    if not isinstance(content, dict):
        return None
    return content


def checksum_short_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    checksum = safe_str(metadata.get("checksumSha256"))
    return checksum[:12] if checksum else None


def coordinate_within_bounds(bounds: Any, lon: float, lat: float) -> bool:
    return bounds.left <= lon <= bounds.right and bounds.bottom <= lat <= bounds.top


def valid_coordinate(lat: float, lon: float) -> bool:
    return (
        math.isfinite(lat)
        and math.isfinite(lon)
        and -90 <= lat <= 90
        and -180 <= lon <= 180
    )


def normalize_azimuth(value: float) -> float:
    return float(value % 360)


def percentile(values: list[float], percent: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    sorted_values = sorted(values)
    rank = (len(sorted_values) - 1) * percent / 100
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return float(sorted_values[low])
    return float(sorted_values[low] * (high - rank) + sorted_values[high] * (rank - low))


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def round_optional(value: float | int | None, digits: int) -> float | None:
    if value is None:
        return None
    if not math.isfinite(float(value)):
        return None
    return round(float(value), digits)


def elapsed_ms(started_at: float) -> float:
    return round((perf_counter() - started_at) * 1000, 1)
