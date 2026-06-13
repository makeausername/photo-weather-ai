from __future__ import annotations

import json
from pathlib import Path

import pytest

rasterio = pytest.importorskip("rasterio")
np = pytest.importorskip("numpy")

from fastapi.testclient import TestClient
from rasterio.transform import from_origin

import app.main as astro_main
from app.main import app
from app.models import SkyBrightnessQueryRequest
from app.sky_brightness import SkyBrightnessService
from scripts.import_sky_brightness_raster import import_dataset, main as sky_brightness_import_main


def write_array_raster(
    path: Path,
    data: np.ndarray,
    *,
    transform=None,
    crs: str = "EPSG:4326",
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
        crs=crs,
        transform=transform or from_origin(-2.0, 2.0, 0.1, 0.1),
        nodata=nodata,
    ) as dataset:
        dataset.write(data.astype("float32"), 1)


def write_metadata(data_dir: Path, *, value_type: str = "sqm", value_unit: str = "mag/arcsec^2") -> None:
    current = data_dir / "current"
    current.mkdir(parents=True, exist_ok=True)
    metadata = {
        "datasetExists": True,
        "metadataExists": True,
        "datasetName": "Synthetic WA sky brightness",
        "datasetVersion": "test-v1",
        "datasetYear": 2026,
        "sourceName": "Synthetic model",
        "sourceType": "modeled_sky_brightness",
        "valueType": value_type,
        "valueUnit": value_unit,
        "crs": "EPSG:4326",
        "width": 41,
        "height": 41,
        "bounds": {"west": -2, "south": -2, "east": 2, "north": 2},
        "resolution": {"xDegrees": 0.1, "yDegrees": 0.1},
        "noDataValue": -9999,
        "checksumSha256": "c" * 64,
        "importedAt": "2026-06-13T00:00:00+00:00",
        "rasterPath": "/app/data/sky-brightness/current/sky-brightness.cog.tif",
        "healthStatus": "available",
        "loadError": None,
        "notes": ["test fixture"],
    }
    (current / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    (current / "checksum.sha256").write_text(f"{'c' * 64}  sky-brightness.cog.tif\n", encoding="utf-8")


def service_for_fixture(
    tmp_path: Path,
    data: np.ndarray,
    *,
    value_type: str = "sqm",
    value_unit: str = "mag/arcsec^2",
) -> SkyBrightnessService:
    data_dir = tmp_path / "sky-brightness"
    raster_path = data_dir / "current" / "sky-brightness.cog.tif"
    write_array_raster(raster_path, data)
    write_metadata(data_dir, value_type=value_type, value_unit=value_unit)
    return SkyBrightnessService(raster_path, data_dir / "current" / "metadata.json", cache_size=2)


def test_missing_sky_brightness_raster_is_non_fatal(tmp_path: Path) -> None:
    service = SkyBrightnessService(
        tmp_path / "current" / "missing.tif",
        tmp_path / "current" / "metadata.json",
    )

    response = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )
    health = service.health_state()

    assert response.available is False
    assert response.unavailableReason == "dataset_missing"
    assert response.diagnostics.healthStatus == "missing"
    assert health.available is False
    assert health.health_status == "missing"


def test_metadata_missing_is_reported(tmp_path: Path) -> None:
    raster_path = tmp_path / "current" / "sky-brightness.cog.tif"
    write_array_raster(raster_path, np.full((10, 10), 21.4, dtype="float32"))
    service = SkyBrightnessService(raster_path, tmp_path / "current" / "metadata.json")

    response = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=1.5, longitudeWgs84=-1.5, timezone="Asia/Shanghai")
    )

    assert response.available is False
    assert response.unavailableReason == "metadata_missing"
    assert service.health_state().health_status == "metadata_missing"


def test_valid_modeled_sqm_fixture_returns_estimated_range_and_reference(tmp_path: Path) -> None:
    service = service_for_fixture(tmp_path, np.full((41, 41), 21.55, dtype="float32"))

    first = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )
    second = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )

    assert first.available is True
    assert first.valueType == "sqm"
    assert first.modeledSqm == pytest.approx(21.55)
    assert first.estimatedBortleRange is not None
    assert first.estimatedBortleRange.available is True
    assert first.estimatedBortleRange.minClass == 2
    assert first.estimatedBortleRange.maxClass == 3
    assert first.chinaDarkSkyReference is not None
    assert first.chinaDarkSkyReference.modelDerived is True
    assert first.chinaDarkSkyReference.measured is False
    assert first.chinaDarkSkyReference.official is False
    assert second.cacheHit is True


def test_artificial_brightness_fixture_converts_conservatively(tmp_path: Path) -> None:
    service = service_for_fixture(
        tmp_path,
        np.full((41, 41), 0.35, dtype="float32"),
        value_type="artificial_brightness_mcd_m2",
        value_unit="mcd/m^2",
    )

    response = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )

    assert response.available is True
    assert response.artificialBrightness == pytest.approx(0.35)
    assert response.modeledSqm is not None
    assert response.estimatedBortleRange is not None
    assert response.estimatedBortleRange.maxClass > response.estimatedBortleRange.minClass
    assert any("widened" in note for note in response.diagnostics.uncertaintyNotes)


def test_unknown_value_type_keeps_raw_value_without_fake_sqm_or_bortle(tmp_path: Path) -> None:
    service = service_for_fixture(
        tmp_path,
        np.full((41, 41), 123.0, dtype="float32"),
        value_type="unknown",
        value_unit="raw",
    )

    response = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=0, longitudeWgs84=0, timezone="Asia/Shanghai")
    )

    assert response.available is True
    assert response.rawValue == pytest.approx(123)
    assert response.modeledSqm is None
    assert response.estimatedBortleRange is None


def test_coordinate_outside_bounds_is_reported(tmp_path: Path) -> None:
    service = service_for_fixture(tmp_path, np.full((41, 41), 21.2, dtype="float32"))

    response = service.query(
        SkyBrightnessQueryRequest(latitudeWgs84=20, longitudeWgs84=20, timezone="Asia/Shanghai")
    )

    assert response.available is False
    assert response.unavailableReason == "coordinate_outside_bounds"


def test_sky_brightness_endpoint_uses_configured_service(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = service_for_fixture(tmp_path, np.full((41, 41), 21.4, dtype="float32"))
    monkeypatch.setattr(astro_main, "get_sky_brightness_service", lambda: service)
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/sky-brightness/query",
        json={"latitudeWgs84": 0, "longitudeWgs84": 0, "timezone": "Asia/Shanghai"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is True
    assert payload["valueType"] == "sqm"
    assert payload["modeledSqm"] == pytest.approx(21.4)


def test_importer_creates_metadata_and_check_reports_status(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = tmp_path / "source.tif"
    data_dir = tmp_path / "sky-brightness"
    write_array_raster(source, np.full((20, 20), 21.2, dtype="float32"))

    import_dataset(
        sources=[source],
        data_dir=data_dir,
        dataset_name="Synthetic WA",
        dataset_year=2026,
        dataset_version="test",
        source_name="Synthetic source",
        source_type="modeled_sky_brightness",
        value_type="sqm",
        value_unit="mag/arcsec^2",
        notes=["fixture"],
        keep_backups=1,
    )

    metadata = json.loads((data_dir / "current" / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["datasetExists"] is True
    assert metadata["metadataExists"] is True
    assert metadata["valueType"] == "sqm"
    assert metadata["healthStatus"] == "available"
    assert metadata["checksumSha256"]
    assert (data_dir / "current" / "sky-brightness.cog.tif").exists()

    exit_code = sky_brightness_import_main(["--check", "--json", "--data-dir", str(data_dir)])
    output = capsys.readouterr().out
    report = json.loads(output[output.find("{") :])
    assert exit_code == 0
    assert report["datasetExists"] is True
    assert report["metadataExists"] is True
    assert report["healthStatus"] == "available"
