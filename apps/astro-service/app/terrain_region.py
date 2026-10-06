"""Area statistics from the active DEM, separate from directional horizons."""
from __future__ import annotations

from pydantic import BaseModel, Field


class TerrainRegionRequest(BaseModel):
    latitudeWgs84: float = Field(ge=-85, le=85)
    longitudeWgs84: float = Field(ge=-180, le=180)


class TerrainRegionResponse(BaseModel):
    available: bool = False
    reason: str | None = None
    elevationMeters: float | None = None
    minElevation1km: float | None = None
    minElevation3km: float | None = None
    minElevation5km: float | None = None
    maxElevation5km: float | None = None
    avgElevation5km: float | None = None
    sampleCount: int = 0
    validSampleCount: int = 0
    datasetName: str | None = None
    datasetVersion: str | None = None
    samplingVersion: str = "terrain-region-v2"


def query_region(service, request: TerrainRegionRequest) -> TerrainRegionResponse:
    with service.dataset.read_session():
        return _query_region_locked(service, request)


def _query_region_locked(service, request: TerrainRegionRequest) -> TerrainRegionResponse:
    from .terrain_dem import sample_elevation
    metadata = service.dataset.metadata or {}
    basis = dict(datasetName=metadata.get("datasetName"), datasetVersion=metadata.get("datasetVersion"))
    try:
        import numpy as np
        from rasterio.windows import from_bounds
        from rasterio.transform import xy
        from pyproj import Geod
        dataset = service.dataset.open()
        if dataset is None:
            return TerrainRegionResponse(reason="dem_unavailable", **basis)
        if dataset.crs is None or dataset.crs.to_epsg() != 4326:
            return TerrainRegionResponse(reason="unsupported_crs", **basis)
        lon, lat = request.longitudeWgs84, request.latitudeWgs84
        geod = Geod(ellps="WGS84")
        west = geod.fwd(lon, lat, 270, 5100)[0]
        east = geod.fwd(lon, lat, 90, 5100)[0]
        south = geod.fwd(lon, lat, 180, 5100)[1]
        north = geod.fwd(lon, lat, 0, 5100)[1]
        bounds = dataset.bounds
        if west >= east or west < bounds.left or east > bounds.right or south < bounds.bottom or north > bounds.top:
            return TerrainRegionResponse(reason="incomplete_region_coverage", **basis)
        window = from_bounds(west, south, east, north, dataset.transform).round_offsets().round_lengths()
        # Bound memory for unusually fine rasters. Statistics describe the sampled grid.
        shape = (min(512, max(1, int(window.height))), min(512, max(1, int(window.width))))
        data = dataset.read(1, window=window, out_shape=shape, masked=True)
        transform = dataset.window_transform(window) * dataset.transform.scale(window.width / shape[1], window.height / shape[0])
        rr, cc = np.indices(shape)
        xs, ys = xy(transform, rr.ravel(), cc.ravel())
        xs, ys = np.asarray(xs), np.asarray(ys)
        distances = geod.inv(np.full(xs.shape, lon), np.full(ys.shape, lat), xs, ys)[2]
        values = np.asarray(data.astype(float).filled(np.nan)).ravel()
        valid = np.isfinite(values) & (values >= -500) & (values <= 9000)
        circle = distances <= 5000
        count, good = int(circle.sum()), int((circle & valid).sum())
        basis.update(sampleCount=count, validSampleCount=good)
        minima = []
        for radius in (1000, 3000, 5000):
            mask = distances <= radius
            if int(mask.sum()) < 4 or int((mask & valid).sum()) / int(mask.sum()) < 0.95:
                return TerrainRegionResponse(reason="incomplete_region_samples", **basis)
            minima.append(round(float(values[mask & valid].min()), 1))
        elevation = sample_elevation(dataset, lon, lat)
        if elevation is None:
            return TerrainRegionResponse(reason="missing_observer_elevation", **basis)
        region = values[circle & valid]
        # A resampled grid can miss a narrow peak, so allow 100 m, but never
        # accept a centre thousands of metres above the surrounding maximum.
        if not np.isfinite(elevation) or not -500 <= elevation <= 9000 or not (
            float(region.min()) - 100 <= elevation <= float(region.max()) + 100
        ):
            return TerrainRegionResponse(reason="inconsistent_region_elevation", **basis)
        return TerrainRegionResponse(available=True, elevationMeters=round(elevation, 1),
            minElevation1km=minima[0], minElevation3km=minima[1], minElevation5km=minima[2],
            maxElevation5km=round(float(region.max()), 1), avgElevation5km=round(float(region.mean()), 1), **basis)
    except (ImportError, OSError, RuntimeError, ValueError) as error:
        return TerrainRegionResponse(reason=type(error).__name__, **basis)
