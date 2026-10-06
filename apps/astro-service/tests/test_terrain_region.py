from types import SimpleNamespace

import pytest

np = pytest.importorskip("numpy")
rasterio = pytest.importorskip("rasterio")
from rasterio.transform import from_origin
from app.terrain_region import TerrainRegionRequest, query_region


@pytest.mark.parametrize("state", ["valid", "nodata", "edge", "center_missing"])
def test_regional_stats_require_real_coverage(tmp_path, state):
    data = np.full((201, 201), 100, dtype="int16")
    data[90:110, 120:125] = 800
    if state == "nodata":
        data[:] = -9999
    if state == "center_missing":
        data[100, 100] = -9999
    path = tmp_path / "dem.tif"
    with rasterio.open(path, "w", driver="GTiff", width=201, height=201, count=1,
                       dtype="int16", crs="EPSG:4326", transform=from_origin(-.1, .1, .001, .001), nodata=-9999) as dst:
        dst.write(data, 1)
    with rasterio.open(path) as dataset:
        service = SimpleNamespace(dataset=SimpleNamespace(open=lambda: dataset,
            metadata={"datasetName": "Actual DEM", "datasetVersion": "v1"}))
        result = query_region(service, TerrainRegionRequest(latitudeWgs84=0,
            longitudeWgs84=.09 if state == "edge" else 0))
    assert result.available == (state == "valid")
    assert result.datasetName == "Actual DEM"
    if state == "valid":
        assert result.elevationMeters == 100
        assert result.minElevation1km == result.minElevation3km == result.minElevation5km == 100
        assert result.maxElevation5km == 800
        assert 100 < result.avgElevation5km < 800
        assert result.validSampleCount == result.sampleCount > 100
    else:
        assert result.minElevation5km is None
        assert result.maxElevation5km is None


def test_missing_dataset_does_not_invent_area_stats():
    service = SimpleNamespace(dataset=SimpleNamespace(open=lambda: None, metadata=None))
    result = query_region(service, TerrainRegionRequest(latitudeWgs84=30, longitudeWgs84=110))
    assert not result.available
    assert result.minElevation5km is None
    assert result.sampleCount == 0
