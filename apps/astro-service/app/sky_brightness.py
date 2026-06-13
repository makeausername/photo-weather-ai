from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
import json
import math
from threading import RLock
from time import perf_counter
from typing import Any

try:
    import numpy as np
    import rasterio
    from rasterio.errors import RasterioIOError
except Exception as exc:  # pragma: no cover - exercised when optional deps are absent.
    np = None  # type: ignore[assignment]
    rasterio = None  # type: ignore[assignment]
    RasterioIOError = Exception  # type: ignore[assignment]
    RASTER_DEPENDENCY_ERROR: Exception | None = exc
else:
    RASTER_DEPENDENCY_ERROR = None

from .models import (
    ChinaDarkSkyReference,
    SkyBrightnessBounds,
    SkyBrightnessDiagnostics,
    SkyBrightnessEstimatedBortleRange,
    SkyBrightnessQueryRequest,
    SkyBrightnessQueryResponse,
    SkyBrightnessResolution,
    SkyBrightnessValueType,
)


SUPPORTED_VALUE_TYPES: set[str] = {
    "sqm",
    "artificial_brightness_mcd_m2",
    "ratio_to_natural",
    "radiance",
    "bortle_class",
    "unknown",
}
DEFAULT_VALUE_TYPE: SkyBrightnessValueType = "unknown"
DEFAULT_DATASET_NAME = "operator-provided modeled sky brightness raster"
NATURAL_SKY_SQM = 21.6
NATURAL_SKY_BRIGHTNESS_MCD_M2 = 0.174
SQM_LUMINANCE_OFFSET = 12.6
QUERY_MODEL_VERSION = "world-atlas-sky-brightness-query-v1"
CONVERSION_MODEL_VERSION = "wa-modeled-sqm-v1"


@dataclass(frozen=True)
class DatasetSignature:
    checksum_short: str | None
    dataset_mtime_ns: int
    metadata_mtime_ns: int

    def cache_token(self) -> str:
        return f"{self.checksum_short or 'no-checksum'}:{self.dataset_mtime_ns}:{self.metadata_mtime_ns}"


@dataclass(frozen=True)
class HealthState:
    available: bool
    dataset_path_configured: bool
    dataset_exists: bool
    metadata_available: bool
    dataset_name: str | None
    dataset_year: int | None
    dataset_version: str | None
    value_type: SkyBrightnessValueType | None
    checksum_short: str | None
    health_status: str
    load_error: str | None


class SkyBrightnessDataset:
    def __init__(self, dataset_path: Path, metadata_path: Path) -> None:
        self.dataset_path = dataset_path
        self.metadata_path = metadata_path
        self._lock = RLock()
        self._dataset: Any | None = None
        self._metadata: dict[str, Any] | None = None
        self._signature: DatasetSignature | None = None
        self._load_error: str | None = None
        self._health_status = "missing"

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def metadata(self) -> dict[str, Any] | None:
        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            return dict(self._metadata) if self._metadata else read_metadata_file(self.metadata_path)

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
        metadata = read_metadata_file(self.metadata_path)
        if RASTER_DEPENDENCY_ERROR is not None:
            return HealthState(
                available=False,
                dataset_path_configured=bool(str(self.dataset_path)),
                dataset_exists=self.dataset_path.exists(),
                metadata_available=self.metadata_path.exists(),
                dataset_name=safe_str(metadata.get("datasetName") if metadata else None),
                dataset_year=safe_int(metadata.get("datasetYear") if metadata else None),
                dataset_version=safe_str(metadata.get("datasetVersion") if metadata else None),
                value_type=metadata_value_type(metadata),
                checksum_short=checksum_short_from_metadata(metadata),
                health_status="unreadable",
                load_error=f"dependency_missing:{RASTER_DEPENDENCY_ERROR}",
            )

        with self._lock:
            self._ensure_open_locked(raise_on_error=False)
            metadata = self._metadata or metadata
            value_type = metadata_value_type(metadata)
            return HealthState(
                available=self._dataset is not None and self._health_status == "available",
                dataset_path_configured=bool(str(self.dataset_path)),
                dataset_exists=self.dataset_path.exists(),
                metadata_available=self.metadata_path.exists(),
                dataset_name=safe_str(metadata.get("datasetName") if metadata else None),
                dataset_year=safe_int(metadata.get("datasetYear") if metadata else None),
                dataset_version=safe_str(metadata.get("datasetVersion") if metadata else None),
                value_type=value_type,
                checksum_short=checksum_short_from_metadata(metadata),
                health_status=self._health_status,
                load_error=self._load_error,
            )

    def open(self):
        with self._lock:
            self._ensure_open_locked(raise_on_error=True)
            return self._dataset

    def _ensure_open_locked(self, *, raise_on_error: bool) -> None:
        if RASTER_DEPENDENCY_ERROR is not None:
            self._reset_open_state("unreadable", f"dependency_missing:{RASTER_DEPENDENCY_ERROR}")
            if raise_on_error:
                raise RuntimeError(self._load_error)
            return

        if not self.dataset_path.exists():
            self._reset_open_state("missing", "dataset_missing")
            return
        if not self.metadata_path.exists():
            self._reset_open_state("metadata_missing", "metadata_missing")
            return

        signature = self._current_signature()
        if self._dataset is not None and self._signature == signature:
            return

        if self._dataset is not None:
            self._dataset.close()
            self._dataset = None

        try:
            metadata = read_metadata_file(self.metadata_path) or {}
            dataset = rasterio.open(self.dataset_path)  # type: ignore[union-attr]
            if dataset.count < 1:
                raise RuntimeError("dataset_has_no_band")
            if dataset.width <= 0 or dataset.height <= 0:
                raise RuntimeError("dataset_has_invalid_dimensions")
            if dataset.crs is None or dataset.crs.to_epsg() != 4326:
                raise RuntimeError("dataset_crs_is_not_epsg4326")
            metadata_value = safe_str(metadata.get("valueType"))
            health_status = "available"
            load_error = None
            if metadata_value and metadata_value not in SUPPORTED_VALUE_TYPES:
                health_status = "unsupported_value_type"
                load_error = f"unsupported_value_type:{metadata_value}"
            self._metadata = metadata
            self._dataset = dataset
            self._signature = signature
            self._health_status = health_status
            self._load_error = load_error
        except (RasterioIOError, OSError, RuntimeError, json.JSONDecodeError) as exc:
            self._reset_open_state("unreadable", f"{type(exc).__name__}:{exc}")
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

    def _reset_open_state(self, health_status: str, error: str) -> None:
        if self._dataset is not None:
            self._dataset.close()
        self._dataset = None
        self._metadata = None
        self._signature = None
        self._health_status = health_status
        self._load_error = error


class SkyBrightnessService:
    def __init__(self, dataset_path: Path, metadata_path: Path, cache_size: int = 1024) -> None:
        self.dataset = SkyBrightnessDataset(dataset_path, metadata_path)
        self.cache_size = max(0, cache_size)
        self._cache: OrderedDict[tuple[Any, ...], SkyBrightnessQueryResponse] = OrderedDict()
        self._lock = RLock()

    def close(self) -> None:
        self.dataset.close()
        with self._lock:
            self._cache.clear()

    def health_state(self) -> HealthState:
        return self.dataset.health_state()

    def query(self, request: SkyBrightnessQueryRequest) -> SkyBrightnessQueryResponse:
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
            signature.cache_token(),
            QUERY_MODEL_VERSION,
        )
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.move_to_end(cache_key)
                return cached.model_copy(update={"cacheHit": True, "queryElapsedMs": elapsed_ms(started_at)})

        response = self._query_uncached(request, started_at)
        if response.dataAvailable and self.cache_size > 0:
            with self._lock:
                self._cache[cache_key] = response.model_copy(update={"cacheHit": False})
                while len(self._cache) > self.cache_size:
                    self._cache.popitem(last=False)
        return response

    def _query_uncached(
        self,
        request: SkyBrightnessQueryRequest,
        started_at: float,
    ) -> SkyBrightnessQueryResponse:
        dataset = self.dataset.open()
        metadata = self.dataset.metadata or {}
        value_type = metadata_value_type(metadata)
        unsupported_metadata_value = unsupported_value_type(metadata)

        if not coordinate_within_bounds(dataset.bounds, request.longitudeWgs84, request.latitudeWgs84):
            return unavailable_response(
                "coordinate_outside_bounds",
                metadata=metadata,
                query_elapsed_ms=elapsed_ms(started_at),
                diagnostics_overrides={
                    "bounds": bounds_model(dataset.bounds),
                    "resolution": resolution_model(dataset),
                },
            )

        raw_value = sample_raster_value(dataset, request.longitudeWgs84, request.latitudeWgs84)
        if raw_value is None:
            return unavailable_response(
                "insufficient_data",
                metadata=metadata,
                query_elapsed_ms=elapsed_ms(started_at),
                sample_count=1,
                diagnostics_overrides={
                    "bounds": bounds_model(dataset.bounds),
                    "resolution": resolution_model(dataset),
                },
            )

        conversion = convert_sky_brightness_value(raw_value, value_type)
        estimated_range = estimated_bortle_from_conversion(conversion, value_type)
        china_reference = china_dark_sky_reference(conversion.get("modeledSqm"))
        conversion_notes = conversion["conversionNotes"]
        uncertainty_notes = conversion["uncertaintyNotes"]
        if unsupported_metadata_value:
            uncertainty_notes = [
                *uncertainty_notes,
                "Metadata valueType is not supported; raw raster value is diagnostic only.",
            ]

        return SkyBrightnessQueryResponse(
            available=True,
            dataAvailable=True,
            unavailableReason="unsupported_value_type" if unsupported_metadata_value else None,
            sourceName=safe_str(metadata.get("sourceName")),
            sourceType=safe_str(metadata.get("sourceType")),
            datasetName=safe_str(metadata.get("datasetName")) or DEFAULT_DATASET_NAME,
            datasetYear=safe_int(metadata.get("datasetYear")),
            datasetVersion=safe_str(metadata.get("datasetVersion")),
            checksumShort=checksum_short_from_metadata(metadata),
            valueType=value_type,
            rawValue=round_optional(raw_value, 6),
            valueUnit=safe_str(metadata.get("valueUnit")),
            modeledSqm=round_optional(conversion.get("modeledSqm"), 3),
            artificialBrightness=round_optional(conversion.get("artificialBrightness"), 6),
            naturalSkyBrightnessMcdM2=round_optional(
                conversion.get("naturalSkyBrightnessMcdM2"),
                6,
            ),
            modeledTotalSkyBrightnessMcdM2=round_optional(
                conversion.get("modeledTotalSkyBrightnessMcdM2"),
                6,
            ),
            estimatedBortleRange=estimated_range,
            chinaDarkSkyReference=china_reference,
            confidence=conversion["confidence"],
            diagnostics=diagnostics(
                metadata=metadata,
                health_status="unsupported_value_type" if unsupported_metadata_value else "available",
                dataset_path=self.dataset.dataset_path,
                metadata_path=self.dataset.metadata_path,
                bounds=bounds_model(dataset.bounds),
                resolution=resolution_model(dataset),
                sample_count=1,
                valid_sample_count=1,
                conversion_notes=conversion_notes,
                uncertainty_notes=uncertainty_notes,
                load_error=self.dataset.load_error,
            ),
            queryElapsedMs=elapsed_ms(started_at),
            cacheHit=False,
        )


def convert_sky_brightness_value(
    raw_value: float,
    value_type: SkyBrightnessValueType,
) -> dict[str, Any]:
    conversion_notes: list[str] = []
    uncertainty_notes: list[str] = []
    modeled_sqm: float | None = None
    artificial_brightness: float | None = None
    natural_sky_brightness_mcd_m2: float | None = None
    modeled_total_sky_brightness_mcd_m2: float | None = None
    raw_bortle_class: int | None = None
    confidence: str = "low"

    if value_type == "sqm":
        if 10 <= raw_value <= 25:
            modeled_sqm = raw_value
            confidence = "medium"
            conversion_notes.append("Raster valueType=sqm; value is treated as modeled raster-derived SQM.")
        else:
            uncertainty_notes.append("SQM raster value is outside the expected physical range.")
    elif value_type == "artificial_brightness_mcd_m2":
        artificial_brightness = max(0.0, raw_value)
        natural_sky_brightness_mcd_m2 = NATURAL_SKY_BRIGHTNESS_MCD_M2
        modeled_total_sky_brightness_mcd_m2 = (
            natural_sky_brightness_mcd_m2 + artificial_brightness
        )
        modeled_sqm = sqm_from_luminance_mcd_m2(modeled_total_sky_brightness_mcd_m2)
        confidence = "low"
        conversion_notes.append(
            "Interpreted raster value as artificial zenith sky brightness in mcd/m^2, added the natural-sky luminance baseline, then derived modeled SQM."
        )
        uncertainty_notes.append("Artificial-brightness conversion is model-derived; Bortle range is widened.")
    elif value_type == "ratio_to_natural":
        ratio = max(0.0, raw_value)
        modeled_sqm = NATURAL_SKY_SQM - 2.5 * math.log10(1.0 + ratio)
        artificial_brightness = NATURAL_SKY_BRIGHTNESS_MCD_M2 * ratio
        natural_sky_brightness_mcd_m2 = NATURAL_SKY_BRIGHTNESS_MCD_M2
        modeled_total_sky_brightness_mcd_m2 = (
            natural_sky_brightness_mcd_m2 + artificial_brightness
        )
        confidence = "low"
        conversion_notes.append("Converted ratio_to_natural to modeled SQM using a natural-sky baseline.")
        uncertainty_notes.append("Ratio conversion is model-derived; Bortle range is widened.")
    elif value_type == "bortle_class":
        if 1 <= raw_value <= 9:
            raw_bortle_class = max(1, min(9, round(raw_value)))
        confidence = "low"
        conversion_notes.append("Raster valueType=bortle_class; no SQM is derived.")
        uncertainty_notes.append("Bortle-class rasters are treated as broad model diagnostics, not field observations.")
    else:
        conversion_notes.append("Raster value is retained as a raw diagnostic only.")
        uncertainty_notes.append("Value type does not support defensible SQM or Bortle conversion.")

    return {
        "modeledSqm": modeled_sqm,
        "artificialBrightness": artificial_brightness,
        "naturalSkyBrightnessMcdM2": natural_sky_brightness_mcd_m2,
        "modeledTotalSkyBrightnessMcdM2": modeled_total_sky_brightness_mcd_m2,
        "rawBortleClass": raw_bortle_class,
        "confidence": confidence,
        "conversionNotes": conversion_notes,
        "uncertaintyNotes": uncertainty_notes,
    }


"""
def estimated_bortle_from_conversion(
    conversion: dict[str, Any],
    value_type: SkyBrightnessValueType,
) -> SkyBrightnessEstimatedBortleRange | None:
    modeled_sqm = conversion.get("modeledSqm")
    if modeled_sqm is None and value_type != "bortle_class":
        return None
    if value_type == "bortle_class":
        return None
    if not isinstance(modeled_sqm, (int, float)) or not math.isfinite(float(modeled_sqm)):
        return None

    base_range = bortle_range_from_sqm(float(modeled_sqm))
    if value_type != "sqm":
        base_range = widen_bortle_range(base_range[0], base_range[1], lower=False)
    min_class, max_class = base_range
    confidence = conversion["confidence"]
    basis = (
        f"Modeled SQM {round(float(modeled_sqm), 3)} mag/arcsec^2 from a local sky-brightness raster; "
        "this is not a measured SQM observation."
    )
    return SkyBrightnessEstimatedBortleRange(
        available=True,
        minClass=min_class,
        maxClass=max_class,
        rangeLabelZh=f"{min_class}-{max_class}级（模型估算）",
        confidence=confidence,
        basisZh=basis,
        methodVersion=CONVERSION_MODEL_VERSION,
    )


def china_dark_sky_reference(modeled_sqm: float | None) -> ChinaDarkSkyReference | None:
    if modeled_sqm is None or not math.isfinite(modeled_sqm):
        return None
    if modeled_sqm >= 21.3:
        label = "模型参考：深暗天空"
    elif modeled_sqm >= 20.6:
        label = "模型参考：较暗天空"
    elif modeled_sqm >= 19.5:
        label = "模型参考：尚暗，需要现场确认"
    else:
        label = "模型参考：受周边光害影响"
    return ChinaDarkSkyReference(
        available=True,
        labelZh=label,
        noteZh="模型参考，非实测，非官方认证；不得作为国家标准等级展示。",
    )


"""

def estimated_bortle_from_conversion(
    conversion: dict[str, Any],
    value_type: SkyBrightnessValueType,
) -> SkyBrightnessEstimatedBortleRange | None:
    modeled_sqm = conversion.get("modeledSqm")
    raw_bortle_class = conversion.get("rawBortleClass")
    if value_type == "bortle_class":
        if not isinstance(raw_bortle_class, int):
            return None
        min_class, max_class = widen_bortle_range(raw_bortle_class, raw_bortle_class, lower=True)
        basis = (
            f"Raster Bortle class {raw_bortle_class} from a local sky-brightness model; "
            "this is not a field observation."
        )
        return SkyBrightnessEstimatedBortleRange(
            available=True,
            minClass=min_class,
            maxClass=max_class,
            rangeLabelZh=f"{min_class}-{max_class}\u7ea7\uff08\u6a21\u578b\u4f30\u7b97\uff09",
            confidence=conversion["confidence"],
            basisZh=basis,
            methodVersion=CONVERSION_MODEL_VERSION,
        )
    if modeled_sqm is None:
        return None
    if not isinstance(modeled_sqm, (int, float)) or not math.isfinite(float(modeled_sqm)):
        return None

    base_range = bortle_range_from_sqm(float(modeled_sqm))
    if value_type != "sqm":
        base_range = widen_bortle_range(base_range[0], base_range[1], lower=False)
    min_class, max_class = base_range
    basis = (
        f"Modeled SQM {round(float(modeled_sqm), 3)} mag/arcsec^2 from a local sky-brightness raster; "
        "this is not a measured SQM observation."
    )
    return SkyBrightnessEstimatedBortleRange(
        available=True,
        minClass=min_class,
        maxClass=max_class,
        rangeLabelZh=f"{min_class}-{max_class}\u7ea7\uff08\u6a21\u578b\u4f30\u7b97\uff09",
        confidence=conversion["confidence"],
        basisZh=basis,
        methodVersion=CONVERSION_MODEL_VERSION,
    )


def china_dark_sky_reference(modeled_sqm: float | None) -> ChinaDarkSkyReference | None:
    if modeled_sqm is None or not math.isfinite(modeled_sqm):
        return None
    if modeled_sqm >= 21.3:
        label = "\u6a21\u578b\u53c2\u8003\uff1a\u6df1\u6697\u5929\u7a7a"
    elif modeled_sqm >= 20.6:
        label = "\u6a21\u578b\u53c2\u8003\uff1a\u8f83\u6697\u5929\u7a7a"
    elif modeled_sqm >= 19.5:
        label = "\u6a21\u578b\u53c2\u8003\uff1a\u5c1a\u6697\uff0c\u9700\u8981\u73b0\u573a\u786e\u8ba4"
    else:
        label = "\u6a21\u578b\u53c2\u8003\uff1a\u53d7\u5468\u8fb9\u5149\u5bb3\u5f71\u54cd"
    return ChinaDarkSkyReference(
        available=True,
        labelZh=label,
        noteZh="\u6a21\u578b\u53c2\u8003\uff0c\u975e\u5b9e\u6d4b\uff0c\u975e\u5b98\u65b9\u8ba4\u8bc1\uff1b\u4e0d\u5f97\u4f5c\u4e3a\u56fd\u5bb6\u6807\u51c6\u7b49\u7ea7\u5c55\u793a\u3002",
    )


def bortle_range_from_sqm(sqm: float) -> tuple[int, int]:
    if sqm >= 21.75:
        return (1, 2)
    if sqm >= 21.3:
        return (2, 3)
    if sqm >= 20.6:
        return (3, 4)
    if sqm >= 19.5:
        return (4, 5)
    if sqm >= 18.5:
        return (5, 6)
    if sqm >= 17.5:
        return (6, 7)
    if sqm >= 16.5:
        return (7, 8)
    return (8, 9)


def widen_bortle_range(min_class: int, max_class: int, *, lower: bool) -> tuple[int, int]:
    widened_min = max(1, min_class - 1) if lower else min_class
    return widened_min, min(9, max(max_class + 1, widened_min))


def sqm_from_luminance_mcd_m2(total_mcd_m2: float) -> float | None:
    if total_mcd_m2 <= 0 or not math.isfinite(total_mcd_m2):
        return None
    total_cd_m2 = total_mcd_m2 / 1000.0
    return SQM_LUMINANCE_OFFSET - 2.5 * math.log10(total_cd_m2)


def sample_raster_value(dataset: Any, lon: float, lat: float) -> float | None:
    try:
        sample = next(dataset.sample([(lon, lat)], indexes=1, masked=True))
    except (StopIteration, RasterioIOError, ValueError):
        return None
    return masked_sample_value(sample)


def masked_sample_value(sample: Any) -> float | None:
    if np is None:
        return None
    array = np.ma.asarray(sample)
    if array.size == 0 or np.ma.is_masked(array[0]):
        return None
    value = float(array[0])
    return value if math.isfinite(value) else None


def unavailable_response(
    reason: str,
    *,
    metadata: dict[str, Any] | None = None,
    query_elapsed_ms: float | None = None,
    sample_count: int = 0,
    load_error: str | None = None,
    diagnostics_overrides: dict[str, Any] | None = None,
) -> SkyBrightnessQueryResponse:
    metadata = metadata or {}
    if load_error:
        reason = f"{reason}:{load_error}"
    value_type = metadata_value_type(metadata)
    return SkyBrightnessQueryResponse(
        available=False,
        dataAvailable=False,
        unavailableReason=reason,
        sourceName=safe_str(metadata.get("sourceName")),
        sourceType=safe_str(metadata.get("sourceType")),
        datasetName=safe_str(metadata.get("datasetName")),
        datasetYear=safe_int(metadata.get("datasetYear")),
        datasetVersion=safe_str(metadata.get("datasetVersion")),
        checksumShort=checksum_short_from_metadata(metadata),
        valueType=value_type,
        valueUnit=safe_str(metadata.get("valueUnit")),
        confidence="low",
        diagnostics=diagnostics(
            metadata=metadata,
            health_status=reason.split(":")[0],
            dataset_path=None,
            metadata_path=None,
            sample_count=sample_count,
            valid_sample_count=0,
            conversion_notes=[],
            uncertainty_notes=["WA/model sky-brightness data is unavailable; do not infer a dark sky from absence."],
            load_error=load_error,
            **(diagnostics_overrides or {}),
        ),
        queryElapsedMs=query_elapsed_ms,
        cacheHit=False,
    )


def diagnostics(
    *,
    metadata: dict[str, Any],
    health_status: str,
    dataset_path: Path | None,
    metadata_path: Path | None,
    bounds: SkyBrightnessBounds | None = None,
    resolution: SkyBrightnessResolution | None = None,
    sample_count: int,
    valid_sample_count: int,
    conversion_notes: list[str],
    uncertainty_notes: list[str],
    load_error: str | None,
) -> SkyBrightnessDiagnostics:
    return SkyBrightnessDiagnostics(
        healthStatus=normalize_health_status(health_status),
        rasterPath=safe_str(metadata.get("rasterPath")) or (str(dataset_path) if dataset_path else None),
        metadataPath=str(metadata_path) if metadata_path else None,
        metadataExists=bool(metadata_path.exists()) if metadata_path else False,
        datasetExists=bool(dataset_path.exists()) if dataset_path else False,
        loadError=load_error,
        bounds=bounds,
        resolution=resolution,
        sampleCount=sample_count,
        validSampleCount=valid_sample_count,
        conversionNotes=conversion_notes,
        uncertaintyNotes=uncertainty_notes,
    )


def normalize_health_status(value: str) -> str:
    normalized = value.split(":")[0]
    if normalized == "dataset_missing":
        return "missing"
    if normalized == "metadata_missing":
        return "metadata_missing"
    if normalized == "coordinate_outside_bounds":
        return "missing"
    if normalized == "insufficient_data":
        return "insufficient_data"
    if normalized == "unsupported_value_type":
        return "unsupported_value_type"
    if normalized in SUPPORTED_VALUE_TYPES:
        return "available"
    if normalized == "available":
        return "available"
    return "unreadable"


def read_metadata_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        content = json.load(handle)
    if not isinstance(content, dict):
        return None
    return content


def metadata_value_type(metadata: dict[str, Any] | None) -> SkyBrightnessValueType:
    value_type = safe_str(metadata.get("valueType") if metadata else None)
    if value_type in SUPPORTED_VALUE_TYPES:
        return value_type  # type: ignore[return-value]
    return DEFAULT_VALUE_TYPE


def unsupported_value_type(metadata: dict[str, Any] | None) -> str | None:
    value_type = safe_str(metadata.get("valueType") if metadata else None)
    if value_type and value_type not in SUPPORTED_VALUE_TYPES:
        return value_type
    return None


def checksum_short_from_metadata(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    checksum = safe_str(metadata.get("checksumSha256") or metadata.get("checksum"))
    return checksum[:12] if checksum else None


def coordinate_within_bounds(bounds: Any, lon: float, lat: float) -> bool:
    return bounds.left <= lon <= bounds.right and bounds.bottom <= lat <= bounds.top


def bounds_model(bounds: Any) -> SkyBrightnessBounds:
    return SkyBrightnessBounds(
        west=float(bounds.left),
        south=float(bounds.bottom),
        east=float(bounds.right),
        north=float(bounds.top),
    )


def resolution_model(dataset: Any) -> SkyBrightnessResolution:
    return SkyBrightnessResolution(
        xDegrees=abs(float(dataset.transform.a)),
        yDegrees=abs(float(dataset.transform.e)),
    )


def valid_coordinate(lat: float, lon: float) -> bool:
    return (
        math.isfinite(lat)
        and math.isfinite(lon)
        and -90 <= lat <= 90
        and -180 <= lon <= 180
    )


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


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
