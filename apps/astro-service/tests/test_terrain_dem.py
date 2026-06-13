from __future__ import annotations

import json
from pathlib import Path

import pytest

rasterio = pytest.importorskip("rasterio")
np = pytest.importorskip("numpy")

from rasterio.transform import from_origin

from app.models import TerrainDemProfileQueryRequest
from app.terrain_dem import TerrainDemService
from scripts.import_terrain_dem import discover_sources, import_dataset


def write_dem_raster(
    path: Path,
    data: np.ndarray,
    *,
    nodata: float = -9999.0,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=int(data.shape[1]),
        height=int(data.shape[0]),
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(-0.1, 0.1, 0.001, 0.001),
        nodata=nodata,
    ) as dataset:
        dataset.write(data.astype("float32"), 1)


def write_dem_metadata(data_dir: Path, *, width: int = 201, height: int = 201) -> None:
    current = data_dir / "current"
    current.mkdir(parents=True, exist_ok=True)
    metadata = {
        "datasetName": "Synthetic terrain DEM",
        "sourceName": "Synthetic DEM",
        "datasetYear": 2026,
        "datasetVersion": "test-dem-v1",
        "checksumSha256": "a" * 64,
        "crs": "EPSG:4326",
        "width": width,
        "height": height,
        "bounds": {"west": -0.1, "south": -0.101, "east": 0.101, "north": 0.1},
        "resolution": {"xDegrees": 0.001, "yDegrees": 0.001, "approximateMeters": 111.32},
        "verticalUnit": "meter",
        "noDataValue": -9999,
        "rasterPath": "/app/data/terrain-dem/current/terrain-dem.cog.tif",
        "healthStatus": "available",
    }
    (current / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    (current / "checksum.sha256").write_text(
        f"{'a' * 64}  terrain-dem.cog.tif\n",
        encoding="utf-8",
    )


def write_profile_dataset(data_dir: Path, *, nodata_only: bool = False) -> None:
    current = data_dir / "current"
    width = height = 201
    nodata = -9999.0
    if nodata_only:
        data = np.full((height, width), nodata, dtype="float32")
    else:
        data = np.full((height, width), 100.0, dtype="float32")
        center = width // 2
        for col in range(center + 4, min(width, center + 22)):
            data[:, col] = 520.0 + (col - center) * 2.0
    write_dem_raster(current / "terrain-dem.cog.tif", data, nodata=nodata)
    write_dem_metadata(data_dir, width=width, height=height)


def terrain_service(data_dir: Path) -> TerrainDemService:
    return TerrainDemService(
        data_dir / "current" / "terrain-dem.cog.tif",
        data_dir / "current" / "metadata.json",
    )


def profile_request(**overrides: object) -> TerrainDemProfileQueryRequest:
    payload = {
        "latitudeWgs84": 0.0,
        "longitudeWgs84": 0.0,
        "target": "milky_way",
        "targetAzimuthDegrees": 90.0,
        "targetAltitudeDegrees": 30.0,
        "maxDistanceMeters": 3000.0,
        "sampleIntervalMeters": 100.0,
    }
    payload.update(overrides)
    return TerrainDemProfileQueryRequest(**payload)


def test_missing_terrain_dem_is_unavailable_without_faking_clearance(tmp_path: Path) -> None:
    service = terrain_service(tmp_path)

    health = service.health_state()
    response = service.query_profile(profile_request())

    assert health.available is False
    assert health.dataset_exists is False
    assert health.health_status == "missing"
    assert response.available is False
    assert response.unavailableReason == "terrain_dem_missing"
    assert response.obstructionLevel == "unknown"
    assert response.horizonAltitudeDegrees is None
    assert response.demCoverage is not None
    assert response.demCoverage.requiredTileId == "Copernicus_DSM_COG_30_N00_00_E000_00_DEM"
    assert response.demCoverage.coveredByActiveDataset is False


def test_metadata_missing_is_reported_separately(tmp_path: Path) -> None:
    data = np.full((201, 201), 100.0, dtype="float32")
    write_dem_raster(tmp_path / "current" / "terrain-dem.cog.tif", data)

    service = terrain_service(tmp_path)
    response = service.query_profile(profile_request(observerElevationMeters=100.0))

    assert service.health_state().health_status == "metadata_missing"
    assert response.available is False
    assert response.unavailableReason == "terrain_dem_metadata_missing"


def test_out_of_bounds_and_no_data_are_honest_unavailable_states(tmp_path: Path) -> None:
    write_profile_dataset(tmp_path)
    service = terrain_service(tmp_path)

    out_of_bounds = service.query_profile(
        profile_request(latitudeWgs84=10.0, longitudeWgs84=10.0, observerElevationMeters=100.0),
    )
    assert out_of_bounds.available is False
    assert out_of_bounds.unavailableReason == "terrain_dem_out_of_bounds"
    assert out_of_bounds.demCoverage is not None
    assert out_of_bounds.demCoverage.requiredTileId == "Copernicus_DSM_COG_30_N10_00_E010_00_DEM"
    assert out_of_bounds.demCoverage.coveredByActiveDataset is False

    no_data_dir = tmp_path / "nodata"
    write_profile_dataset(no_data_dir, nodata_only=True)
    no_data = terrain_service(no_data_dir).query_profile(profile_request(observerElevationMeters=100.0))
    assert no_data.available is False
    assert no_data.unavailableReason == "terrain_dem_no_data"
    assert no_data.sampleCount > 0
    assert no_data.validSampleCount == 0
    assert no_data.demCoverage is not None
    assert no_data.demCoverage.requiredTileId == "Copernicus_DSM_COG_30_N00_00_E000_00_DEM"


def test_missing_target_geometry_does_not_report_covered_dem_as_missing(tmp_path: Path) -> None:
    write_profile_dataset(tmp_path)
    service = terrain_service(tmp_path)

    response = service.query_profile(profile_request(targetAzimuthDegrees=None))

    assert response.available is False
    assert response.dataAvailable is False
    assert response.unavailableReason == "missing_target_geometry"
    assert response.demCoverage is not None
    assert response.demCoverage.coveredByActiveDataset is True
    assert response.terrainHorizonNoteZh == "DEM数据覆盖可用，但本次未计算遮挡剖面，因为缺少目标方位/高度。"


def test_directional_profile_uses_target_azimuth_and_dem_observer_elevation(tmp_path: Path) -> None:
    write_profile_dataset(tmp_path)
    service = terrain_service(tmp_path)

    east = service.query_profile(profile_request(targetAzimuthDegrees=90.0, targetAltitudeDegrees=30.0))
    west = service.query_profile(profile_request(targetAzimuthDegrees=270.0, targetAltitudeDegrees=3.1))
    marginal = service.query_profile(
        profile_request(
            targetAzimuthDegrees=90.0,
            targetAltitudeDegrees=(east.horizonAltitudeDegrees or 0) + 1.0,
        ),
    )

    assert east.available is True
    assert east.demCoverage is not None
    assert east.demCoverage.coveredByActiveDataset is True
    assert east.observerElevationSource == "dem"
    assert east.observerElevationMeters == pytest.approx(100.0)
    assert east.obstructionLevel == "obstructed"
    assert east.horizonAltitudeDegrees is not None
    assert east.horizonAltitudeDegrees > 30
    assert east.maxObstructionSample is not None
    assert east.maxObstructionSample.longitudeWgs84 > 0
    assert east.confidence in {"medium", "high"}

    assert west.available is True
    assert west.obstructionLevel == "clear"
    assert west.horizonAltitudeDegrees is not None
    assert west.horizonAltitudeDegrees < 1
    assert west.maxObstructionSample is not None
    assert west.maxObstructionSample.longitudeWgs84 < 0

    assert marginal.available is True
    assert marginal.obstructionLevel == "marginal"


def test_insufficient_directional_samples_are_low_confidence_unavailable(tmp_path: Path) -> None:
    current = tmp_path / "current"
    data = np.full((201, 201), -9999.0, dtype="float32")
    data[100, 100] = 100.0
    data[100, 101] = 120.0
    write_dem_raster(current / "terrain-dem.cog.tif", data)
    write_dem_metadata(tmp_path)

    response = terrain_service(tmp_path).query_profile(
        profile_request(observerElevationMeters=100.0, sampleCount=20),
    )

    assert response.available is False
    assert response.unavailableReason == "insufficient_directional_sample"
    assert response.sampleCount == 20
    assert 0 < response.validSampleCount < 8


def test_import_tool_accepts_local_geotiff_and_rejects_remote_sources(tmp_path: Path) -> None:
    source = tmp_path / "incoming" / "source-dem.tif"
    data = np.full((32, 32), 100.0, dtype="float32")
    write_dem_raster(source, data)

    with pytest.raises(ValueError, match="remote sources are not supported"):
        discover_sources(["https://example.com/dem.tif"])

    import_dataset(
        sources=[source],
        data_dir=tmp_path / "runtime",
        dataset_name="Synthetic terrain DEM",
        source_name="Synthetic DEM",
        dataset_year=2026,
        dataset_version="test-dem-v1",
        vertical_unit="meter",
        keep_backups=1,
    )

    current = tmp_path / "runtime" / "current"
    assert (current / "terrain-dem.cog.tif").exists()
    metadata = json.loads((current / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["datasetName"] == "Synthetic terrain DEM"
    assert metadata["sourceName"] == "Synthetic DEM"
    assert metadata["datasetYear"] == 2026
    assert metadata["datasetVersion"] == "test-dem-v1"
