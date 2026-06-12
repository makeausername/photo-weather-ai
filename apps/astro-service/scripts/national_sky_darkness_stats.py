from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import math
from pathlib import Path
import sys
from typing import Any

try:
    import numpy as np
    import rasterio
except Exception as exc:  # pragma: no cover - import failure is reported by CLI entrypoint.
    raise SystemExit(f"raster statistics dependencies are unavailable: {exc}") from exc

from app.light_pollution import LightPollutionService
from app.models import LightPollutionQueryRequest


STATS_TOOL_VERSION = "national-sky-darkness-stats-v1"
DEFAULT_DATA_DIR = Path("/app/data/light-pollution")
DEFAULT_OUTPUT_PATH = Path("/app/deploy/calibration/runtime/national-sky-darkness-stats.json")
DEFAULT_CHINA_BBOX = (73.0, 18.0, 135.0, 54.0)
QUANTILE_POINTS = (1, 5, 10, 25, 50, 75, 90, 95, 99)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    data_dir = Path(args.data_dir)
    dataset_path = Path(args.dataset_path) if args.dataset_path else data_dir / "current" / "light-pollution.cog.tif"
    metadata_path = Path(args.metadata_path) if args.metadata_path else data_dir / "current" / "metadata.json"
    output_path = Path(args.output)
    bbox = parse_bbox(args.bbox)

    report = build_national_sky_darkness_stats(
        dataset_path=dataset_path,
        metadata_path=metadata_path,
        bbox=bbox,
        step_degrees=args.step_degrees,
        coarse_grid_degrees=args.coarse_grid_degrees,
        max_points=args.max_points,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"OK wrote national sky darkness stats: {output_path}")
    print(f"sampled={report['sample']['totalSampledPoints']} valid={report['sample']['validSampledPoints']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sample the active VIIRS-compatible raster into national sky-darkness statistics.",
    )
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Light-pollution data directory.")
    parser.add_argument("--dataset-path", help="Active raster path. Defaults to current/light-pollution.cog.tif.")
    parser.add_argument("--metadata-path", help="Active metadata path. Defaults to current/metadata.json.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Runtime JSON output path.")
    parser.add_argument(
        "--bbox",
        default=",".join(str(value) for value in DEFAULT_CHINA_BBOX),
        help="Sampling bounding box as west,south,east,north.",
    )
    parser.add_argument("--step-degrees", type=float, default=0.5, help="Deterministic grid step in degrees.")
    parser.add_argument("--coarse-grid-degrees", type=float, default=5.0, help="Coarse audit grid size.")
    parser.add_argument("--max-points", type=int, default=0, help="Optional deterministic cap; 0 means no cap.")
    return parser


def build_national_sky_darkness_stats(
    *,
    dataset_path: Path,
    metadata_path: Path,
    bbox: tuple[float, float, float, float],
    step_degrees: float,
    coarse_grid_degrees: float,
    max_points: int = 0,
) -> dict[str, Any]:
    if step_degrees <= 0 or not math.isfinite(step_degrees):
        raise ValueError("--step-degrees must be a positive finite number")
    if coarse_grid_degrees <= 0 or not math.isfinite(coarse_grid_degrees):
        raise ValueError("--coarse-grid-degrees must be a positive finite number")
    if max_points < 0:
        raise ValueError("--max-points must be non-negative")
    if not dataset_path.exists():
        raise FileNotFoundError(f"dataset not found: {dataset_path}")
    if not metadata_path.exists():
        raise FileNotFoundError(f"metadata not found: {metadata_path}")

    west, south, east, north = bbox
    points = deterministic_grid_points(west, south, east, north, step_degrees)
    if max_points > 0:
        points = points[:max_points]

    service = LightPollutionService(dataset_path, metadata_path, cache_size=0)
    metadata = service.dataset.metadata or {}
    raw_values: list[float] = []
    positive_values: list[float] = []
    local_values: list[float] = []
    halo_values: list[float] = []
    ambient_risk_values: list[float] = []
    local_to_halo_values: list[float] = []
    halo_to_local_values: list[float] = []
    coarse_grid: dict[str, dict[str, int]] = {}
    negative_or_nodata_count = 0
    negative_count = 0
    nodata_count = 0
    zero_count = 0
    valid_sampled_points = 0
    valid_light_pollution_points = 0

    try:
        dataset = service.dataset.open()
        for lon, lat in points:
            raw_value = sample_raster_value(dataset, lon, lat)
            grid_key = coarse_grid_key(lon, lat, west, south, coarse_grid_degrees)
            grid_entry = coarse_grid.setdefault(grid_key, {"sampledPoints": 0, "validPoints": 0})
            grid_entry["sampledPoints"] += 1

            if raw_value is None:
                nodata_count += 1
                negative_or_nodata_count += 1
                continue
            valid_sampled_points += 1
            grid_entry["validPoints"] += 1
            raw_values.append(max(0.0, raw_value))
            if raw_value < 0:
                negative_count += 1
                negative_or_nodata_count += 1
            if raw_value == 0:
                zero_count += 1
            if raw_value > 0:
                positive_values.append(raw_value)

            response = service.query(
                LightPollutionQueryRequest(
                    latitudeWgs84=lat,
                    longitudeWgs84=lon,
                    timezone="Asia/Shanghai",
                )
            )
            if not response.available or not response.dataAvailable:
                continue
            valid_light_pollution_points += 1
            if response.localRadiance is not None:
                local_values.append(float(response.localRadiance))
            if response.surroundingHaloRadiance is not None:
                halo_values.append(float(response.surroundingHaloRadiance))
            if response.ambientRiskIndex is not None:
                ambient_risk_values.append(float(response.ambientRiskIndex))
            if (
                response.localRadiance is not None
                and response.surroundingHaloRadiance is not None
                and response.surroundingHaloRadiance > 0
            ):
                local_to_halo_values.append(float(response.localRadiance / response.surroundingHaloRadiance))
            if (
                response.localRadiance is not None
                and response.surroundingHaloRadiance is not None
                and response.localRadiance > 0
            ):
                halo_to_local_values.append(float(response.surroundingHaloRadiance / response.localRadiance))
    finally:
        service.close()

    return {
        "toolVersion": STATS_TOOL_VERSION,
        "generatedAt": datetime.now(UTC).isoformat(),
        "dataset": {
            "sourceCode": metadata.get("sourceCode"),
            "sourceLabel": metadata.get("sourceLabel"),
            "datasetYear": metadata.get("datasetYear"),
            "datasetVersion": metadata.get("datasetVersion"),
            "checksumShort": str(metadata.get("checksumSha256", ""))[:12] or None,
        },
        "sampling": {
            "deterministic": True,
            "method": "fixed_lon_lat_grid_cell_centers",
            "bbox": {"west": west, "south": south, "east": east, "north": north},
            "stepDegrees": step_degrees,
            "coarseGridDegrees": coarse_grid_degrees,
            "maxPoints": max_points or None,
        },
        "sample": {
            "totalSampledPoints": len(points),
            "validSampledPoints": valid_sampled_points,
            "validLightPollutionPoints": valid_light_pollution_points,
            "zeroRadianceRatio": ratio(zero_count, valid_sampled_points),
            "negativeNoDataCount": negative_or_nodata_count,
            "negativeRadianceCount": negative_count,
            "noDataCount": nodata_count,
        },
        "distributions": {
            "positiveRadianceQuantiles": quantiles(positive_values),
            "allRadianceQuantiles": quantiles(raw_values),
            "localRadianceQuantiles": quantiles(local_values),
            "surroundingHaloRadianceQuantiles": quantiles(halo_values),
            "ambientRiskIndexQuantiles": quantiles(ambient_risk_values),
            "localToHaloRatioQuantiles": quantiles(local_to_halo_values),
            "haloToLocalRatioQuantiles": quantiles(halo_to_local_values),
            "coarseGrid": dict(sorted(coarse_grid.items())),
        },
        "diagnosticNotes": [
            "Generated runtime statistics are QA/operator inputs and should remain outside Git.",
            "Statistics summarize nationwide raster signals; they do not encode place-specific production rules.",
            "Low-radiance saturation and urban halo spillover must be handled conservatively by public display code.",
        ],
    }


def deterministic_grid_points(
    west: float,
    south: float,
    east: float,
    north: float,
    step_degrees: float,
) -> list[tuple[float, float]]:
    if not (west < east and south < north):
        raise ValueError("bbox must satisfy west < east and south < north")
    points: list[tuple[float, float]] = []
    lat = south + step_degrees / 2
    while lat <= north:
        lon = west + step_degrees / 2
        while lon <= east:
            points.append((round(lon, 8), round(lat, 8)))
            lon += step_degrees
        lat += step_degrees
    return points


def sample_raster_value(dataset: Any, lon: float, lat: float) -> float | None:
    if not (dataset.bounds.left <= lon <= dataset.bounds.right and dataset.bounds.bottom <= lat <= dataset.bounds.top):
        return None
    try:
        sample = next(dataset.sample([(lon, lat)], indexes=1, masked=True))
    except (StopIteration, ValueError):
        return None
    array = np.ma.asarray(sample)
    if array.size == 0 or np.ma.is_masked(array[0]):
        return None
    value = float(array[0])
    return value if math.isfinite(value) else None


def quantiles(values: list[float]) -> dict[str, float]:
    finite = np.array([value for value in values if math.isfinite(value)], dtype="float64")
    if finite.size == 0:
        return {}
    return {f"p{point:02d}": round(float(np.percentile(finite, point)), 6) for point in QUANTILE_POINTS}


def coarse_grid_key(
    lon: float,
    lat: float,
    west: float,
    south: float,
    coarse_grid_degrees: float,
) -> str:
    lon_index = math.floor((lon - west) / coarse_grid_degrees)
    lat_index = math.floor((lat - south) / coarse_grid_degrees)
    return f"x{lon_index:03d}_y{lat_index:03d}"


def ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 6)


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("--bbox must be west,south,east,north")
    numbers = tuple(float(part) for part in parts)
    if not all(math.isfinite(part) for part in numbers):
        raise ValueError("--bbox values must be finite")
    west, south, east, north = numbers
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("--bbox values are outside valid WGS84 bounds")
    return west, south, east, north


if __name__ == "__main__":
    sys.exit(main())
