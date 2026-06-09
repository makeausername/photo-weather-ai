from __future__ import annotations

import json
from pathlib import Path

import pytest

rasterio = pytest.importorskip("rasterio")
np = pytest.importorskip("numpy")

from pydantic import ValidationError
from rasterio.transform import from_origin

from app.light_pollution import LightPollutionService
from app.models import LightPollutionQueryRequest
from scripts.import_light_pollution import import_dataset


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


def write_metadata(data_dir: Path, checksum: str = "a" * 64) -> None:
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
        "minimumRadiance": 0,
        "maximumRadiance": 48,
        "quantiles": {"p05": 2, "p50": 20, "p75": 30, "p90": 38, "p95": 44},
        "geographicBounds": {"west": -2, "south": -2, "east": 2, "north": 2},
        "importerVersion": "test",
    }
    (current / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    (current / "checksum.sha256").write_text(f"{checksum}  light-pollution.cog.tif\n", encoding="utf-8")


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
