from __future__ import annotations

import argparse
from contextlib import ExitStack
from datetime import UTC, datetime
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any

try:
    import numpy as np
    import rasterio
    from pyproj import Geod
    from rasterio.enums import Resampling
    from rasterio.io import DatasetReader
    from rasterio.shutil import copy as rio_copy
    from rasterio.transform import Affine
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import calculate_default_transform, transform_bounds
except Exception as exc:  # pragma: no cover - import failure is reported by CLI entrypoint.
    raise SystemExit(f"raster import dependencies are unavailable: {exc}") from exc


IMPORTER_VERSION = "terrain-dem-import-v1"
STATS_ALGORITHM_VERSION = "block-summary-v1"
DEFAULT_DATA_DIR = Path("/app/data/terrain-dem")
CURRENT_FILES = {
    "raster": "terrain-dem.cog.tif",
    "metadata": "metadata.json",
    "checksum": "checksum.sha256",
}
VALID_EXTENSIONS = {".tif", ".tiff"}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    data_dir = Path(args.data_dir)

    if args.check:
        report_current_dataset(data_dir, as_json=args.json)
        return 0

    sources = discover_sources(args.source)
    if not sources:
        parser.error("a local DEM GeoTIFF/COG source file or directory is required")

    import_dataset(
        sources=sources,
        data_dir=data_dir,
        dataset_name=args.dataset_name,
        source_name=args.source_name,
        dataset_year=args.dataset_year,
        dataset_version=args.dataset_version,
        vertical_unit=args.vertical_unit,
        keep_backups=args.keep_backups,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import a local terrain DEM GeoTIFF/COG dataset.")
    parser.add_argument("source", nargs="*", help="GeoTIFF file(s), tile directory, or files under incoming/.")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Terrain DEM data directory.")
    parser.add_argument("--dataset-name", default="Local terrain DEM")
    parser.add_argument("--source-name", default="Operator supplied DEM")
    parser.add_argument("--dataset-year", type=int)
    parser.add_argument("--dataset-version")
    parser.add_argument("--vertical-unit", default="meter", choices=["meter"])
    parser.add_argument("--keep-backups", type=int, default=3)
    parser.add_argument("--check", action="store_true", help="Inspect the active dataset instead of importing.")
    parser.add_argument("--json", action="store_true", help="Print inspection output as JSON.")
    return parser


def import_dataset(
    *,
    sources: list[Path],
    data_dir: Path,
    dataset_name: str,
    source_name: str,
    dataset_year: int | None,
    dataset_version: str | None,
    vertical_unit: str,
    keep_backups: int,
) -> None:
    incoming_dir = data_dir / "incoming"
    current_dir = data_dir / "current"
    backup_dir = data_dir / "backups"
    for path in (incoming_dir, current_dir, backup_dir):
        path.mkdir(parents=True, exist_ok=True)

    if dataset_year is None:
        print("datasetYear is unavailable; pass --dataset-year when known.")
    if not dataset_version:
        print("datasetVersion is unavailable; pass --dataset-version for traceability when available.")

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    staging_dir = Path(tempfile.mkdtemp(prefix=f".terrain-dem-import-{timestamp}-", dir=str(data_dir)))
    try:
        staged_tiff = staging_dir / CURRENT_FILES["raster"]
        staged_metadata = staging_dir / CURRENT_FILES["metadata"]
        staged_checksum = staging_dir / CURRENT_FILES["checksum"]

        with ExitStack() as stack:
            datasets = [stack.enter_context(rasterio.open(source)) for source in sources]
            validate_sources(datasets)
            working_tiff = staging_dir / "working-epsg4326.tif"
            write_epsg4326_mosaic(datasets, working_tiff)

        write_cog(working_tiff, staged_tiff)
        checksum = sha256_file(staged_tiff)
        staged_checksum.write_text(f"{checksum}  {CURRENT_FILES['raster']}\n", encoding="utf-8")

        with rasterio.open(staged_tiff) as dataset:
            stats = calculate_stats(dataset)
            if stats["validPixelCount"] <= 0:
                raise ValueError("import rejected: DEM has no finite valid elevation pixels")
            metadata = build_metadata(
                dataset=dataset,
                sources=sources,
                dataset_name=dataset_name,
                source_name=source_name,
                dataset_year=dataset_year,
                dataset_version=dataset_version,
                vertical_unit=vertical_unit,
                checksum=checksum,
                stats=stats,
                raster_path="/app/data/terrain-dem/current/terrain-dem.cog.tif",
            )
        staged_metadata.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        validate_import_output(staged_tiff, staged_metadata, checksum)
        rollback_dir = preserve_previous_dataset(current_dir, backup_dir, timestamp)
        activate_dataset(staging_dir, current_dir, rollback_dir)
        prune_backups(backup_dir, keep_backups)
        print(f"OK imported terrain DEM checksum={checksum[:12]} files={len(sources)}")
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise


def discover_sources(values: list[str]) -> list[Path]:
    discovered: list[Path] = []
    for raw_value in values:
        if "://" in raw_value:
            raise ValueError(f"remote sources are not supported: {raw_value}")
        path = Path(raw_value)
        if not path.exists():
            raise FileNotFoundError(f"source not found: {path}")
        if path.is_dir():
            discovered.extend(
                sorted(
                    item
                    for item in path.rglob("*")
                    if item.is_file() and item.suffix.lower() in VALID_EXTENSIONS
                )
            )
        elif path.suffix.lower() in VALID_EXTENSIONS:
            discovered.append(path)
        else:
            raise ValueError(f"unsupported source extension: {path}")
    return sorted(dict.fromkeys(discovered))


def validate_sources(datasets: list[DatasetReader]) -> None:
    if not datasets:
        raise ValueError("no readable DEM GeoTIFF datasets supplied")
    for dataset in datasets:
        if dataset.count < 1:
            raise ValueError(f"{dataset.name} has no raster band")
        if dataset.width <= 0 or dataset.height <= 0:
            raise ValueError(f"{dataset.name} has invalid dimensions")
        if dataset.crs is None:
            raise ValueError(f"{dataset.name} has no CRS")
        bounds = dataset.bounds
        for value in (bounds.left, bounds.right, bounds.top, bounds.bottom):
            if not math.isfinite(value):
                raise ValueError(f"{dataset.name} has non-finite coordinate bounds")
        sample = dataset.read(1, window=((0, min(dataset.height, 32)), (0, min(dataset.width, 32))), masked=True)
        finite = np.asarray(sample.compressed() if np.ma.isMaskedArray(sample) else sample.ravel())
        if finite.size > 0 and not np.isfinite(finite).any():
            raise ValueError(f"{dataset.name} has no finite sample values")


def write_epsg4326_mosaic(datasets: list[DatasetReader], output_path: Path) -> None:
    profile = output_profile_for_sources(datasets)
    nodata = profile["nodata"]
    with rasterio.open(output_path, "w", **profile) as output:
        for _, window in output.block_windows(1):
            block = np.full((int(window.height), int(window.width)), nodata, dtype=np.float32)
            block_valid = np.zeros(block.shape, dtype=bool)
            for source in datasets:
                with WarpedVRT(
                    source,
                    crs="EPSG:4326",
                    transform=profile["transform"],
                    width=profile["width"],
                    height=profile["height"],
                    nodata=nodata,
                    src_nodata=source.nodata,
                    resampling=Resampling.bilinear,
                ) as vrt:
                    data = vrt.read(1, window=window, masked=True, out_dtype="float32")
                    values = np.ma.asarray(data)
                    valid = ~np.ma.getmaskarray(values) & np.isfinite(values.filled(np.nan))
                    fill_mask = valid & ~block_valid
                    block[fill_mask] = values.filled(nodata)[fill_mask]
                    block_valid = block_valid | fill_mask
            output.write(block, 1, window=window)
        build_safe_overviews(output)


def output_profile_for_sources(datasets: list[DatasetReader]) -> dict[str, Any]:
    bounds_list: list[tuple[float, float, float, float]] = []
    resolutions: list[tuple[float, float]] = []
    for dataset in datasets:
        west, south, east, north = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds, densify_pts=21)
        bounds_list.append((west, south, east, north))
        transform, _, _ = calculate_default_transform(
            dataset.crs,
            "EPSG:4326",
            dataset.width,
            dataset.height,
            *dataset.bounds,
        )
        resolutions.append((abs(transform.a), abs(transform.e)))

    west = max(-180.0, min(item[0] for item in bounds_list))
    south = max(-90.0, min(item[1] for item in bounds_list))
    east = min(180.0, max(item[2] for item in bounds_list))
    north = min(90.0, max(item[3] for item in bounds_list))
    if east <= west or north <= south:
        raise ValueError("source bounds do not overlap valid WGS84 coordinates")
    xres = min(value[0] for value in resolutions if value[0] > 0)
    yres = min(value[1] for value in resolutions if value[1] > 0)
    width = max(1, int(math.ceil((east - west) / xres)))
    height = max(1, int(math.ceil((north - south) / yres)))
    transform = Affine.translation(west, north) * Affine.scale(xres, -yres)
    return {
        "driver": "GTiff",
        "width": width,
        "height": height,
        "count": 1,
        "dtype": "float32",
        "crs": "EPSG:4326",
        "transform": transform,
        "nodata": -32768.0,
        "tiled": True,
        "blockxsize": block_size(width),
        "blockysize": block_size(height),
        "compress": "deflate",
        "predictor": 3,
        "BIGTIFF": "IF_SAFER",
    }


def build_safe_overviews(dataset: Any) -> None:
    levels = []
    smallest_side = min(dataset.width, dataset.height)
    level = 2
    while smallest_side // level >= 64:
        levels.append(level)
        level *= 2
    if levels:
        dataset.build_overviews(levels, Resampling.average)
        dataset.update_tags(ns="rio_overview", resampling="average")


def write_cog(source_tiff: Path, output_tiff: Path) -> None:
    try:
        rio_copy(
            source_tiff,
            output_tiff,
            driver="COG",
            compress="DEFLATE",
            blocksize=256,
            overview_resampling="AVERAGE",
        )
    except Exception:
        shutil.copy2(source_tiff, output_tiff)
        with rasterio.open(output_tiff, "r+") as dataset:
            build_safe_overviews(dataset)


def calculate_stats(dataset: DatasetReader) -> dict[str, Any]:
    minimum = math.inf
    maximum = -math.inf
    valid_count = 0
    negative_count = 0
    zero_count = 0
    for _, window in dataset.block_windows(1):
        block = dataset.read(1, window=window, masked=True)
        masked = np.ma.asarray(block)
        data = masked.filled(np.nan).astype("float64", copy=False)
        valid_mask = ~np.ma.getmaskarray(masked) & np.isfinite(data)
        if not np.any(valid_mask):
            continue
        values = data[valid_mask]
        valid_count += int(values.size)
        minimum = min(minimum, float(values.min()))
        maximum = max(maximum, float(values.max()))
        negative_count += int(np.count_nonzero(values < 0))
        zero_count += int(np.count_nonzero(values == 0))
    return {
        "validPixelCount": valid_count,
        "minimumElevationMeters": round(float(minimum), 3) if valid_count else None,
        "maximumElevationMeters": round(float(maximum), 3) if valid_count else None,
        "negativeElevationPixelCount": negative_count,
        "zeroElevationPixelCount": zero_count,
        "statsAlgorithmVersion": STATS_ALGORITHM_VERSION,
    }


def build_metadata(
    *,
    dataset: DatasetReader,
    sources: list[Path],
    dataset_name: str,
    source_name: str,
    dataset_year: int | None,
    dataset_version: str | None,
    vertical_unit: str,
    checksum: str,
    stats: dict[str, Any],
    raster_path: str,
) -> dict[str, Any]:
    transform = dataset.transform
    bounds = dataset.bounds
    x_degrees = abs(transform.a)
    y_degrees = abs(transform.e)
    return {
        "datasetName": dataset_name,
        "datasetYear": dataset_year,
        "datasetVersion": dataset_version,
        "sourceName": source_name,
        "importedAt": datetime.now(UTC).isoformat(),
        "originalFileNames": [source.name for source in sources],
        "checksumSha256": checksum,
        "crs": str(dataset.crs),
        "width": dataset.width,
        "height": dataset.height,
        "bounds": {
            "west": bounds.left,
            "south": bounds.bottom,
            "east": bounds.right,
            "north": bounds.top,
        },
        "resolution": {
            "xDegrees": x_degrees,
            "yDegrees": y_degrees,
            "approximateMeters": approximate_resolution_meters(dataset),
        },
        "verticalUnit": vertical_unit,
        "noDataValue": dataset.nodata,
        "validPixelCount": stats["validPixelCount"],
        "minimumElevationMeters": stats["minimumElevationMeters"],
        "maximumElevationMeters": stats["maximumElevationMeters"],
        "negativeElevationPixelCount": stats["negativeElevationPixelCount"],
        "zeroElevationPixelCount": stats["zeroElevationPixelCount"],
        "statsAlgorithmVersion": stats["statsAlgorithmVersion"],
        "importerVersion": IMPORTER_VERSION,
        "outputFormat": "COG",
        "rasterPath": raster_path,
        "healthStatus": "available",
    }


def approximate_resolution_meters(dataset: DatasetReader) -> float | None:
    geod = Geod(ellps="WGS84")
    center_lat = (dataset.bounds.top + dataset.bounds.bottom) / 2
    center_lon = (dataset.bounds.left + dataset.bounds.right) / 2
    x_distance = geod.inv(center_lon, center_lat, center_lon + abs(dataset.transform.a), center_lat)[2]
    y_distance = geod.inv(center_lon, center_lat, center_lon, center_lat + abs(dataset.transform.e))[2]
    if not math.isfinite(x_distance) or not math.isfinite(y_distance):
        return None
    return round((abs(x_distance) + abs(y_distance)) / 2, 2)


def validate_import_output(tiff: Path, metadata_path: Path, checksum: str) -> None:
    if not tiff.exists() or tiff.stat().st_size <= 0:
        raise ValueError("import output raster is missing or empty")
    with rasterio.open(tiff) as dataset:
        if dataset.crs is None or dataset.crs.to_epsg() != 4326:
            raise ValueError("import output must be EPSG:4326")
        if dataset.count < 1:
            raise ValueError("import output has no raster band")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("checksumSha256") != checksum:
        raise ValueError("metadata checksum does not match output raster")


def preserve_previous_dataset(current_dir: Path, backup_dir: Path, timestamp: str) -> Path | None:
    current_raster = current_dir / CURRENT_FILES["raster"]
    if not current_raster.exists():
        return None
    target = backup_dir / timestamp
    target.mkdir(parents=True, exist_ok=False)
    for file_name in CURRENT_FILES.values():
        source = current_dir / file_name
        if source.exists():
            shutil.copy2(source, target / file_name)
    return target


def activate_dataset(staging_dir: Path, current_dir: Path, rollback_dir: Path | None) -> None:
    current_dir.mkdir(parents=True, exist_ok=True)
    try:
        for file_name in CURRENT_FILES.values():
            staged = staging_dir / file_name
            destination = current_dir / file_name
            if not staged.exists():
                raise FileNotFoundError(f"staged file missing: {staged}")
            staged.replace(destination)
    except Exception:
        restore_current_dataset(current_dir, rollback_dir)
        raise


def restore_current_dataset(current_dir: Path, rollback_dir: Path | None) -> None:
    for file_name in CURRENT_FILES.values():
        destination = current_dir / file_name
        if destination.exists():
            destination.unlink()
    if rollback_dir is None:
        return
    for file_name in CURRENT_FILES.values():
        source = rollback_dir / file_name
        if source.exists():
            shutil.copy2(source, current_dir / file_name)


def prune_backups(backup_dir: Path, keep: int) -> None:
    if keep < 0:
        return
    backups = sorted((path for path in backup_dir.iterdir() if path.is_dir()), reverse=True)
    for old_backup in backups[keep:]:
        shutil.rmtree(old_backup, ignore_errors=True)


def report_current_dataset(data_dir: Path, *, as_json: bool) -> None:
    current_dir = data_dir / "current"
    metadata_path = current_dir / CURRENT_FILES["metadata"]
    checksum_path = current_dir / CURRENT_FILES["checksum"]
    raster_path = current_dir / CURRENT_FILES["raster"]
    report: dict[str, Any] = {
        "activeDatasetExists": raster_path.exists(),
        "metadataExists": metadata_path.exists(),
        "checksumExists": checksum_path.exists(),
        "rasterPath": str(raster_path),
    }
    if metadata_path.exists():
        report.update(json.loads(metadata_path.read_text(encoding="utf-8")))
    if checksum_path.exists():
        report["checksumFile"] = checksum_path.read_text(encoding="utf-8").strip()
    if raster_path.exists():
        try:
            with rasterio.open(raster_path) as dataset:
                report["runtimeRaster"] = {
                    "crs": str(dataset.crs),
                    "width": dataset.width,
                    "height": dataset.height,
                    "bounds": tuple(dataset.bounds),
                    "resolution": {
                        "xDegrees": abs(dataset.transform.a),
                        "yDegrees": abs(dataset.transform.e),
                        "approximateMeters": approximate_resolution_meters(dataset),
                    },
                    "nodata": dataset.nodata,
                }
        except Exception as exc:
            report["loadError"] = f"{type(exc).__name__}: {exc}"
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return
    for key, value in report.items():
        if isinstance(value, (dict, list, tuple)):
            print(f"{key}: {json.dumps(value, ensure_ascii=False, sort_keys=True)}")
        else:
            print(f"{key}: {value}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def block_size(dimension: int) -> int:
    if dimension < 16:
        return 16
    return min(256, max(16, 2 ** int(math.floor(math.log2(min(dimension, 256))))))


if __name__ == "__main__":
    sys.exit(main())
