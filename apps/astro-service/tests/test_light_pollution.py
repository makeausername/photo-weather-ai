from __future__ import annotations

import json
from pathlib import Path

import pytest

rasterio = pytest.importorskip("rasterio")
np = pytest.importorskip("numpy")

from fastapi.testclient import TestClient
from pydantic import ValidationError
from rasterio.transform import from_origin

import app.main as astro_main
from app.light_pollution import (
    DirectionSample,
    LightPollutionService,
    calibration_bound_selection,
    calibration_bounds,
    risk_index,
)
from app.main import app
from app.models import LightPollutionQueryRequest
from scripts.import_light_pollution import STATS_SAMPLE_CAPACITY, calculate_stats, import_dataset
from scripts.national_sky_darkness_stats import build_national_sky_darkness_stats


PRODUCTION_POSITIVE_RADIANCE_QUANTILES = {
    "p05": 0.0,
    "p10": 0.264256,
    "p25": 0.544856,
    "p50": 0.98166,
    "p75": 2.078005,
    "p90": 6.13149,
    "p95": 13.432347,
    "p99": 45.204417,
}

ZERO_RADIANCE_QUANTILES = {f"p{key:02d}": 0 for key in (5, 10, 25, 50, 75, 90, 95, 99)}


def write_test_raster(path: Path, *, crs: str = "EPSG:4326", nodata: float = -9999.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    width = height = 41
    transform = from_origin(-2.0, 2.0, 0.1, 0.1)
    cols = np.arange(width, dtype="float32")
    rows = np.arange(height, dtype="float32")[:, None]
    data = cols + rows * 0.2
    data[0, 0] = nodata
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=nodata,
    ) as dataset:
        dataset.write(data, 1)


def write_array_raster(
    path: Path,
    data: np.ndarray,
    *,
    transform=None,
    crs: str = "EPSG:4326",
    nodata: float = -9999.0,
    tiled: bool = False,
    block_size: int = 128,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "GTiff",
        "width": int(data.shape[1]),
        "height": int(data.shape[0]),
        "count": 1,
        "dtype": "float32",
        "crs": crs,
        "transform": transform or from_origin(-2.0, 2.0, 0.1, 0.1),
        "nodata": nodata,
    }
    if tiled:
        profile.update({"tiled": True, "blockxsize": block_size, "blockysize": block_size})
    with rasterio.open(path, "w", **profile) as dataset:
        dataset.write(data.astype("float32"), 1)


def write_metadata(
    data_dir: Path,
    checksum: str = "a" * 64,
    *,
    overrides: dict[str, object] | None = None,
) -> None:
    current = data_dir / "current"
    current.mkdir(parents=True, exist_ok=True)
    metadata = {
        "sourceCode": "synthetic",
        "sourceLabel": "Synthetic test raster",
        "datasetYear": 2024,
        "datasetVersion": "test",
        "checksumSha256": checksum,
        "crs": "EPSG:4326",
        "width": 41,
        "height": 41,
        "pixelSizeDegrees": {"x": 0.1, "y": 0.1},
        "band": 1,
        "unit": "nW/cm^2/sr",
        "nodata": -9999,
        "validPixelCount": 1680,
        "negativeRadiancePixelCount": 0,
        "zeroRadiancePixelCount": 1,
        "positiveRadiancePixelCount": 1679,
        "rawMinimumRadiance": 0,
        "rawMaximumRadiance": 48,
        "minimumRadiance": 0,
        "maximumRadiance": 48,
        "quantiles": {"p05": 2, "p50": 20, "p75": 30, "p90": 38, "p95": 44},
        "statsSampleCount": 1680,
        "statsSampleCapacity": STATS_SAMPLE_CAPACITY,
        "positiveRadianceStatsSampleCount": 1679,
        "positiveRadianceQuantiles": {"p05": 2, "p50": 20, "p75": 30, "p90": 38, "p95": 44},
        "statsAlgorithmVersion": "test",
        "geographicBounds": {"west": -2, "south": -2, "east": 2, "north": 2},
        "importerVersion": "test",
    }
    if overrides:
        metadata.update(overrides)
    (current / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    (current / "checksum.sha256").write_text(f"{checksum}  light-pollution.cog.tif\n", encoding="utf-8")


def assert_selected_bounds(
    metadata: dict[str, object],
    *,
    low_quantile: str,
    high_quantile: str,
    quantile_source: str,
) -> None:
    selected = calibration_bound_selection(metadata)
    assert selected is not None
    assert selected.low_quantile == low_quantile
    assert selected.high_quantile == high_quantile
    assert selected.quantile_source == quantile_source
    assert calibration_bounds(metadata) == (selected.low, selected.high)


def test_adaptive_positive_radiance_calibration_bounds_select_valid_quantiles() -> None:
    assert_selected_bounds(
        {
            "positiveRadianceQuantiles": {
                "p05": 0.2,
                "p10": 0.3,
                "p25": 0.6,
                "p50": 1.2,
                "p90": 8,
                "p95": 12,
                "p99": 30,
            }
        },
        low_quantile="p05",
        high_quantile="p95",
        quantile_source="positiveRadianceQuantiles",
    )
    assert_selected_bounds(
        {"positiveRadianceQuantiles": PRODUCTION_POSITIVE_RADIANCE_QUANTILES},
        low_quantile="p10",
        high_quantile="p95",
        quantile_source="positiveRadianceQuantiles",
    )
    assert calibration_bounds({"positiveRadianceQuantiles": PRODUCTION_POSITIVE_RADIANCE_QUANTILES}) == (
        pytest.approx(PRODUCTION_POSITIVE_RADIANCE_QUANTILES["p10"]),
        pytest.approx(PRODUCTION_POSITIVE_RADIANCE_QUANTILES["p95"]),
    )
    assert_selected_bounds(
        {
            "positiveRadianceQuantiles": {
                "p05": 0,
                "p10": 0,
                "p25": 0.5,
                "p50": 1.0,
                "p90": 6,
                "p95": 10,
                "p99": 20,
            }
        },
        low_quantile="p25",
        high_quantile="p95",
        quantile_source="positiveRadianceQuantiles",
    )


def test_adaptive_calibration_bounds_reject_invalid_low_and_high_quantiles() -> None:
    assert calibration_bounds(
        {
            "positiveRadianceQuantiles": {
                "p05": 0,
                "p10": 0,
                "p25": -1,
                "p50": "nan",
                "p95": 10,
            }
        }
    ) is None
    assert_selected_bounds(
        {
            "positiveRadianceQuantiles": {
                "p05": 1,
                "p90": 9,
                "p95": 0,
                "p99": 20,
            }
        },
        low_quantile="p05",
        high_quantile="p90",
        quantile_source="positiveRadianceQuantiles",
    )
    assert calibration_bounds(
        {
            "positiveRadianceQuantiles": {
                "p05": 2,
                "p90": 1.5,
                "p95": 2,
                "p99": -1,
            }
        }
    ) is None


def test_calibration_bounds_keep_legacy_metadata_fallback_safe() -> None:
    assert_selected_bounds(
        {"quantiles": {"p05": 0.25, "p50": 1.0, "p95": 10}},
        low_quantile="p05",
        high_quantile="p95",
        quantile_source="quantiles",
    )
    assert calibration_bounds({"quantiles": ZERO_RADIANCE_QUANTILES}) is None
    assert risk_index(5, {"quantiles": ZERO_RADIANCE_QUANTILES}) is None

    legacy_with_negative_minimum = {
        "minimumRadiance": -0.4,
        "rawMinimumRadiance": -0.4,
        "quantiles": {"p05": -0.4, "p10": 0.25, "p50": 1, "p95": 10},
    }
    assert_selected_bounds(
        legacy_with_negative_minimum,
        low_quantile="p10",
        high_quantile="p95",
        quantile_source="quantiles",
    )
    assert risk_index(-0.5, legacy_with_negative_minimum) == 0
    assert risk_index(5, {}) is None


def test_risk_index_clamps_city_and_rural_values_with_production_quantiles() -> None:
    metadata = {
        "positiveRadianceQuantiles": PRODUCTION_POSITIVE_RADIANCE_QUANTILES,
        "quantiles": ZERO_RADIANCE_QUANTILES,
    }

    assert risk_index(100, metadata) == 100
    assert risk_index(0.01, metadata) == 0
    assert risk_index(-0.5, metadata) == 0


def test_light_pollution_query_samples_rings_directions_target_and_cache(tmp_path: Path) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    write_test_raster(raster_path)
    write_metadata(data_dir)

    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=2,
    )
    request = LightPollutionQueryRequest(
        latitudeWgs84=0,
        longitudeWgs84=0,
        observerElevationMeters=1200,
        targetAzimuthDegrees=90,
        timezone="Asia/Shanghai",
    )

    first = service.query(request)
    second = service.query(request)

    assert first.available is True
    assert first.cacheHit is False
    assert second.cacheHit is True
    assert 0 <= (first.ambientRiskIndex or 0) <= 100
    assert 0 <= (first.targetDirectionRisk or 0) <= 100
    assert len(first.directionalRisk) == 8
    assert first.sampleCount > 8
    assert first.validSampleCount > 0
    assert first.calculationBasis is not None
    assert first.calculationBasis.scoringMode == "heuristic"

    write_metadata(data_dir, checksum="b" * 64)
    replaced = service.query(request)
    assert replaced.cacheHit is False
    assert replaced.checksumShort == "bbbbbbbbbbbb"
    service.close()


def test_light_pollution_endpoint_uses_direction_sample_radiance_without_500(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    write_test_raster(raster_path)
    write_metadata(data_dir)
    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=0,
    )

    def fake_sample_direction(
        _dataset,
        _lon: float,
        _lat: float,
        key: str,
        label: str,
        azimuth: float,
    ) -> DirectionSample:
        return DirectionSample(
            direction=key,
            direction_label_zh=label,
            azimuth_degrees=azimuth,
            radiance=12.0 if key == "east" else 4.0,
            sample_count=3,
            valid_sample_count=3,
        )

    monkeypatch.setattr(service, "_sample_direction", fake_sample_direction)
    monkeypatch.setattr(astro_main, "get_light_pollution_service", lambda: service)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/light-pollution/query",
        json={
            "latitudeWgs84": 0,
            "longitudeWgs84": 0,
            "targetAzimuthDegrees": 90,
            "timezone": "Asia/Shanghai",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["ambientRiskIndex"] is not None
    assert payload["targetDirectionRisk"] is not None
    assert len(payload["directionalRisk"]) == 8
    service.close()


def test_light_pollution_endpoint_uses_adaptive_positive_quantile_metadata_without_500(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    write_test_raster(raster_path)
    write_metadata(
        data_dir,
        overrides={
            "statsAlgorithmVersion": "global-coordinate-hash-sample-v1",
            "statsSampleCount": 200000,
            "positiveRadianceStatsSampleCount": 200000,
            "positiveRadiancePixelCount": 95050973,
            "quantiles": ZERO_RADIANCE_QUANTILES,
            "positiveRadianceQuantiles": PRODUCTION_POSITIVE_RADIANCE_QUANTILES,
        },
    )
    metadata = json.loads((data_dir / "current" / "metadata.json").read_text(encoding="utf-8"))
    selected = calibration_bound_selection(metadata)
    assert selected is not None
    assert selected.low == pytest.approx(PRODUCTION_POSITIVE_RADIANCE_QUANTILES["p10"])
    assert selected.high == pytest.approx(PRODUCTION_POSITIVE_RADIANCE_QUANTILES["p95"])
    assert selected.low_quantile == "p10"
    assert selected.high_quantile == "p95"

    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=0,
    )
    monkeypatch.setattr(astro_main, "get_light_pollution_service", lambda: service)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/light-pollution/query",
        json={
            "latitudeWgs84": 0,
            "longitudeWgs84": 0,
            "targetAzimuthDegrees": 90,
            "timezone": "Asia/Shanghai",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert isinstance(payload["ambientRiskIndex"], int)
    assert 0 <= payload["ambientRiskIndex"] <= 100
    assert len(payload["directionalRisk"]) == 8
    assert all(isinstance(item["riskIndex"], int) for item in payload["directionalRisk"])
    assert payload["targetDirectionRisk"] is not None
    assert payload["calculationBasis"]["quantileBasis"] == "adaptive_positive_log_radiance_quantiles"
    service.close()


def test_light_pollution_query_handles_zero_radiance_location_without_target(tmp_path: Path) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    data = np.zeros((41, 41), dtype="float32")
    write_array_raster(raster_path, data)
    write_metadata(
        data_dir,
        overrides={
            "validPixelCount": 1681,
            "zeroRadiancePixelCount": 1681,
            "positiveRadiancePixelCount": 0,
            "maximumRadiance": 0,
            "rawMaximumRadiance": 0,
            "positiveRadianceQuantiles": {"p05": 0.2, "p50": 2.0, "p95": 20.0},
        },
    )
    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=0,
    )

    response = service.query(
        LightPollutionQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )

    assert response.available is True
    assert response.localRadiance == 0
    assert response.ambientRiskIndex == 0
    assert response.ambientRiskLevel == "very_low"
    assert response.targetDirectionRisk is None
    assert response.targetDirectionLevel is None
    service.close()


def test_light_pollution_query_handles_invalid_legacy_calibration_without_exception(
    tmp_path: Path,
) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    write_test_raster(raster_path)
    zero_quantiles = {f"p{key:02d}": 0 for key in (5, 10, 25, 50, 75, 90, 95, 99)}
    write_metadata(
        data_dir,
        overrides={
            "minimumRadiance": 0,
            "rawMinimumRadiance": -0.4,
            "maximumRadiance": 48,
            "rawMaximumRadiance": 48,
            "quantiles": zero_quantiles,
            "positiveRadianceQuantiles": {},
        },
    )
    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=0,
    )

    response = service.query(
        LightPollutionQueryRequest(
            latitudeWgs84=0,
            longitudeWgs84=0,
            targetAzimuthDegrees=90,
            timezone="Asia/Shanghai",
        )
    )

    assert response.available is True
    assert response.ambientRiskIndex is None
    assert response.ambientRiskLevel == "insufficient"
    assert response.targetDirectionRisk is None
    assert all(item.riskIndex is None for item in response.directionalRisk)
    assert risk_index(-0.5, {"positiveRadianceQuantiles": {"p05": 0.2, "p95": 20}}) == 0
    assert risk_index(5, {"quantiles": zero_quantiles, "minimumRadiance": -0.4}) is None
    service.close()


def test_light_pollution_query_handles_no_valid_directional_samples(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    write_test_raster(raster_path)
    write_metadata(data_dir)
    service = LightPollutionService(
        raster_path,
        data_dir / "current" / "metadata.json",
        cache_size=0,
    )

    def no_direction_samples(
        _dataset,
        _lon: float,
        _lat: float,
        key: str,
        label: str,
        azimuth: float,
    ) -> DirectionSample:
        return DirectionSample(
            direction=key,
            direction_label_zh=label,
            azimuth_degrees=azimuth,
            radiance=None,
            sample_count=3,
            valid_sample_count=0,
        )

    monkeypatch.setattr(service, "_sample_direction", no_direction_samples)
    response = service.query(
        LightPollutionQueryRequest(
            latitudeWgs84=0,
            longitudeWgs84=0,
            targetAzimuthDegrees=90,
            timezone="Asia/Shanghai",
        )
    )

    assert response.available is True
    assert response.surroundingHaloRadiance is None
    assert response.ambientRiskIndex is not None
    assert response.targetDirectionRisk is None
    assert all(item.riskLevel == "insufficient" for item in response.directionalRisk)
    service.close()


def test_light_pollution_missing_dataset_and_invalid_coordinates_are_safe(tmp_path: Path) -> None:
    service = LightPollutionService(
        tmp_path / "current" / "missing.tif",
        tmp_path / "current" / "metadata.json",
    )
    response = service.query(
        LightPollutionQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )
    assert response.available is False
    assert response.ambientRiskLevel == "insufficient"
    assert "未按无光污染处理" in response.lightPollutionNoteZh

    with pytest.raises(ValidationError):
        LightPollutionQueryRequest(latitudeWgs84=float("nan"), longitudeWgs84=0)


def test_national_sky_darkness_stats_sampler_generates_deterministic_runtime_report(tmp_path: Path) -> None:
    data_dir = tmp_path / "light-pollution"
    raster_path = data_dir / "current" / "light-pollution.cog.tif"
    rows = np.arange(41, dtype="float32")[:, None]
    cols = np.arange(41, dtype="float32")
    data = (rows + cols) / 10
    data[0, 0] = -1
    data[1, 1] = 0
    write_array_raster(raster_path, data)
    write_metadata(data_dir)

    first = build_national_sky_darkness_stats(
        dataset_path=raster_path,
        metadata_path=data_dir / "current" / "metadata.json",
        bbox=(-1.0, -1.0, 1.0, 1.0),
        step_degrees=1.0,
        coarse_grid_degrees=1.0,
        max_points=0,
    )
    second = build_national_sky_darkness_stats(
        dataset_path=raster_path,
        metadata_path=data_dir / "current" / "metadata.json",
        bbox=(-1.0, -1.0, 1.0, 1.0),
        step_degrees=1.0,
        coarse_grid_degrees=1.0,
        max_points=0,
    )

    assert first["sampling"]["deterministic"] is True
    assert first["sample"] == second["sample"]
    assert first["distributions"] == second["distributions"]
    assert first["sample"]["totalSampledPoints"] == 4
    assert first["sample"]["validSampledPoints"] == 4
    assert first["sample"]["validLightPollutionPoints"] == 4
    assert "p50" in first["distributions"]["positiveRadianceQuantiles"]
    assert "p50" in first["distributions"]["allRadianceQuantiles"]
    assert "p50" in first["distributions"]["localRadianceQuantiles"]
    assert "p50" in first["distributions"]["surroundingHaloRadianceQuantiles"]
    assert "p50" in first["distributions"]["ambientRiskIndexQuantiles"]
    assert first["distributions"]["coarseGrid"]
    assert any("production rules" in note for note in first["diagnosticNotes"])


def test_importer_stats_sample_late_blocks_positive_quantiles_deterministically(tmp_path: Path) -> None:
    source = tmp_path / "late-bright.tif"
    nodata = -9999.0
    data = np.zeros((512, 512), dtype="float32")
    data[20, 20] = -0.25
    data[30, 30] = nodata
    bright_rows, bright_cols = np.indices((80, 512), dtype="float32")
    data[432:, :] = 0.5 + bright_rows * 0.05 + bright_cols * 0.01
    transform = from_origin(-180.0, 90.0, 360.0 / 512.0, 180.0 / 512.0)
    write_array_raster(source, data, transform=transform, nodata=nodata, tiled=True)

    first = calculate_stats(source)
    second = calculate_stats(source)

    assert first == second
    assert first["positiveRadiancePixelCount"] > 0
    assert first["positiveRadianceQuantiles"]["p95"] > 0
    assert first["positiveRadianceQuantiles"]["p95"] > first["positiveRadianceQuantiles"]["p05"]
    assert first["negativeRadiancePixelCount"] == 1
    assert first["rawMinimumRadiance"] < 0
    assert first["minimumRadiance"] == 0
    assert first["statsSampleCount"] <= STATS_SAMPLE_CAPACITY
    assert first["positiveRadianceStatsSampleCount"] <= STATS_SAMPLE_CAPACITY
    assert risk_index(5.0, first) is not None


def test_importer_creates_metadata_checksum_and_preserves_previous_on_failure(tmp_path: Path) -> None:
    data_dir = tmp_path / "light-pollution"
    source = tmp_path / "source.tif"
    write_test_raster(source)
    import_dataset(
        sources=[source],
        data_dir=data_dir,
        preset="eog-viirs-annual",
        source_code="synthetic",
        source_label="Synthetic test raster",
        dataset_year=2024,
        dataset_version="test-v1",
        keep_backups=2,
    )

    current = data_dir / "current"
    assert (current / "light-pollution.cog.tif").exists()
    metadata = json.loads((current / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["crs"] == "EPSG:4326"
    assert metadata["datasetYear"] == 2024
    assert metadata["validPixelCount"] > 0
    assert "p95" in metadata["quantiles"]
    assert metadata["positiveRadiancePixelCount"] > 0
    assert metadata["positiveRadianceQuantiles"]["p95"] > 0
    assert metadata["negativeRadiancePixelCount"] == 0
    assert metadata["statsSampleCount"] <= STATS_SAMPLE_CAPACITY
    assert metadata["statsAlgorithmVersion"] == "global-coordinate-hash-sample-v1"
    checksum_before = metadata["checksumSha256"]

    corrupt = tmp_path / "corrupt.tif"
    corrupt.write_bytes(b"not a geotiff")
    with pytest.raises(Exception):
        import_dataset(
            sources=[corrupt],
            data_dir=data_dir,
            preset="eog-viirs-annual",
            source_code="synthetic",
            source_label="Synthetic test raster",
            dataset_year=2024,
            dataset_version="bad",
            keep_backups=2,
        )

    preserved_metadata = json.loads((current / "metadata.json").read_text(encoding="utf-8"))
    assert preserved_metadata["checksumSha256"] == checksum_before
