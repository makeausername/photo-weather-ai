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
    from rasterio.enums import Resampling
    from rasterio.io import DatasetReader
    from rasterio.shutil import copy as rio_copy
    from rasterio.transform import Affine
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import calculate_default_transform, transform_bounds
except Exception as exc:  # pragma: no cover - import failure is reported by CLI entrypoint.
    raise SystemExit(f"raster import dependencies are unavailable: {exc}") from exc


IMPORTER_VERSION = "light-pollution-import-v1"
STATS_ALGORITHM_VERSION = "global-coordinate-hash-sample-v1"
STATS_SAMPLE_CAPACITY = 200_000
DEFAULT_DATA_DIR = Path("/app/data/light-pollution")
CURRENT_FILES = {
    "raster": "light-pollution.cog.tif",
    "metadata": "metadata.json",
    "checksum": "checksum.sha256",
}
VALID_EXTENSIONS = {".tif", ".tiff"}
QUANTILE_KEYS = (5, 10, 25, 50, 75, 90, 95, 99)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    data_dir = Path(args.data_dir)

    if args.check:
        report_current_dataset(data_dir, as_json=args.json)
        return 0

    sources = discover_sources(args.source)
    if not sources:
        parser.error("at least one GeoTIFF source file or directory is required")

    import_dataset(
        sources=sources,
        data_dir=data_dir,
        preset=args.preset,
        source_code=args.source_code,
        source_label=args.source_label,
        dataset_year=args.dataset_year,
        dataset_version=args.dataset_version,
        keep_backups=args.keep_backups,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import a local VIIRS-compatible nighttime-light GeoTIFF dataset.",
    )
    parser.add_argument("source", nargs="*", help="GeoTIFF file(s), tile directory, or files under incoming/.")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Light-pollution data directory.")
    parser.add_argument("--preset", default="eog-viirs-annual", choices=["eog-viirs-annual"])
    parser.add_argument("--source-code", default="eog-viirs-annual")
    parser.add_argument("--source-label", default="EOG VIIRS annual nighttime lights")
    parser.add_argument("--dataset-year", type=int)
    parser.add_argument("--dataset-version")
    parser.add_argument("--keep-backups", type=int, default=3)
    parser.add_argument("--check", action="store_true", help="Inspect the active dataset instead of importing.")
    parser.add_argument("--json", action="store_true", help="Print inspection output as JSON.")
    return parser


def import_dataset(
    *,
    sources: list[Path],
    data_dir: Path,
    preset: str,
    source_code: str,
    source_label: str,
    dataset_year: int | None,
    dataset_version: str | None,
    keep_backups: int,
) -> None:
    incoming_dir = data_dir / "incoming"
    current_dir = data_dir / "current"
    backup_dir = data_dir / "backups"
    for path in (incoming_dir, current_dir, backup_dir):
        path.mkdir(parents=True, exist_ok=True)

    if dataset_year is None:
        print("datasetYear is unavailable; pass --dataset-year when the source package does not encode it.")
    if not dataset_version:
        print("datasetVersion is unavailable; pass --dataset-version for traceability when available.")

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    staging_dir = Path(tempfile.mkdtemp(prefix=f".import-{timestamp}-", dir=str(data_dir)))
    try:
        staged_tiff = staging_dir / CURRENT_FILES["raster"]
        staged_metadata = staging_dir / CURRENT_FILES["metadata"]
        staged_checksum = staging_dir / CURRENT_FILES["checksum"]

        with ExitStack() as stack:
            datasets = [stack.enter_context(rasterio.open(source)) for source in sources]
            validate_sources(datasets)
            working_tiff = staging_dir / "working-epsg4326.tif"
            write_epsg4326_mosaic(datasets, working_tiff)

        stats = calculate_stats(working_tiff)
        if stats["validPixelCount"] <= 0:
            raise ValueError("import rejected: dataset has no finite valid radiance pixels")

        write_cog(working_tiff, staged_tiff)
        checksum = sha256_file(staged_tiff)
        staged_checksum.write_text(f"{checksum}  {CURRENT_FILES['raster']}\n", encoding="utf-8")

        with rasterio.open(staged_tiff) as dataset:
            metadata = build_metadata(
                dataset=dataset,
                sources=sources,
                preset=preset,
                source_code=source_code,
                source_label=source_label,
                dataset_year=dataset_year,
                dataset_version=dataset_version,
                checksum=checksum,
                stats=stats,
            )
        staged_metadata.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        validate_import_output(staged_tiff, staged_metadata, checksum)
        rollback_dir = preserve_previous_dataset(current_dir, backup_dir, timestamp)
        activate_dataset(staging_dir, current_dir, rollback_dir)
        prune_backups(backup_dir, keep_backups)
        print(f"OK imported light-pollution dataset checksum={checksum[:12]} files={len(sources)}")
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise


def discover_sources(values: list[str]) -> list[Path]:
    discovered: list[Path] = []
    for raw_value in values:
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
        raise ValueError("no readable GeoTIFF datasets supplied")
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
        transform, width, height = calculate_default_transform(
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
        "nodata": -9999.0,
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


def calculate_stats(path: Path) -> dict[str, Any]:
    raw_min_value = math.inf
    raw_max_value = -math.inf
    valid_count = 0
    negative_count = 0
    zero_count = 0
    positive_count = 0
    normalized_sample_values = np.empty(0, dtype="float64")
    normalized_sample_hashes = np.empty(0, dtype="uint64")
    positive_sample_values = np.empty(0, dtype="float64")
    positive_sample_hashes = np.empty(0, dtype="uint64")
    with rasterio.open(path) as dataset:
        for _, window in dataset.block_windows(1):
            block = dataset.read(1, window=window, masked=True)
            masked = np.ma.asarray(block)
            data = masked.filled(np.nan).astype("float64", copy=False)
            valid_mask = ~np.ma.getmaskarray(masked) & np.isfinite(data)
            if not np.any(valid_mask):
                continue

            values = data[valid_mask]
            if values.size == 0:
                continue
            valid_count += int(values.size)
            raw_min_value = min(raw_min_value, float(values.min()))
            raw_max_value = max(raw_max_value, float(values.max()))
            negative_count += int(np.count_nonzero(values < 0))
            zero_count += int(np.count_nonzero(values == 0))
            positive_count += int(np.count_nonzero(values > 0))

            row_offsets, col_offsets = np.nonzero(valid_mask)
            rows = row_offsets.astype("uint64", copy=False) + np.uint64(int(window.row_off))
            cols = col_offsets.astype("uint64", copy=False) + np.uint64(int(window.col_off))
            hashes = coordinate_hashes(rows, cols)

            normalized_values = np.maximum(values, 0.0)
            normalized_sample_values, normalized_sample_hashes = update_bounded_hash_sample(
                normalized_sample_values,
                normalized_sample_hashes,
                normalized_values,
                hashes,
            )

            positive_mask = values > 0
            if np.any(positive_mask):
                positive_sample_values, positive_sample_hashes = update_bounded_hash_sample(
                    positive_sample_values,
                    positive_sample_hashes,
                    values[positive_mask],
                    hashes[positive_mask],
                )

    if valid_count == 0:
        return {
            "validPixelCount": 0,
            "negativeRadiancePixelCount": 0,
            "zeroRadiancePixelCount": 0,
            "positiveRadiancePixelCount": 0,
            "rawMinimumRadiance": None,
            "rawMaximumRadiance": None,
            "minimumRadiance": None,
            "maximumRadiance": None,
            "quantiles": {},
            "statsSampleCount": 0,
            "statsSampleCapacity": STATS_SAMPLE_CAPACITY,
            "positiveRadianceStatsSampleCount": 0,
            "positiveRadianceQuantiles": {},
            "statsAlgorithmVersion": STATS_ALGORITHM_VERSION,
        }

    normalized_min = max(0.0, raw_min_value)
    normalized_max = max(0.0, raw_max_value)
    return {
        "validPixelCount": valid_count,
        "negativeRadiancePixelCount": negative_count,
        "zeroRadiancePixelCount": zero_count,
        "positiveRadiancePixelCount": positive_count,
        "rawMinimumRadiance": round(float(raw_min_value), 6),
        "rawMaximumRadiance": round(float(raw_max_value), 6),
        "minimumRadiance": round(float(normalized_min), 6),
        "maximumRadiance": round(float(normalized_max), 6),
        "quantiles": quantiles_from_sample(normalized_sample_values),
        "statsSampleCount": int(normalized_sample_values.size),
        "statsSampleCapacity": STATS_SAMPLE_CAPACITY,
        "positiveRadianceStatsSampleCount": int(positive_sample_values.size),
        "positiveRadianceQuantiles": quantiles_from_sample(positive_sample_values),
        "statsAlgorithmVersion": STATS_ALGORITHM_VERSION,
    }


def coordinate_hashes(rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    values = (
        rows.astype("uint64", copy=False) * np.uint64(0x9E3779B185EBCA87)
    ) ^ (
        cols.astype("uint64", copy=False) * np.uint64(0xC2B2AE3D27D4EB4F)
    ) ^ np.uint64(0x165667B19E3779F9)
    values = (values ^ (values >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    values = (values ^ (values >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    return values ^ (values >> np.uint64(31))


def update_bounded_hash_sample(
    sample_values: np.ndarray,
    sample_hashes: np.ndarray,
    values: np.ndarray,
    hashes: np.ndarray,
    *,
    capacity: int = STATS_SAMPLE_CAPACITY,
) -> tuple[np.ndarray, np.ndarray]:
    if values.size == 0 or capacity <= 0:
        return sample_values, sample_hashes

    values = values.astype("float64", copy=False)
    hashes = hashes.astype("uint64", copy=False)
    if values.size > capacity:
        keep = np.argpartition(hashes, capacity - 1)[:capacity]
        values = values[keep]
        hashes = hashes[keep]

    if sample_values.size == 0:
        combined_values = values
        combined_hashes = hashes
    else:
        combined_values = np.concatenate([sample_values, values])
        combined_hashes = np.concatenate([sample_hashes, hashes])

    if combined_values.size <= capacity:
        return combined_values, combined_hashes

    keep = np.argpartition(combined_hashes, capacity - 1)[:capacity]
    return combined_values[keep], combined_hashes[keep]


def quantiles_from_sample(values: np.ndarray) -> dict[str, float]:
    if values.size == 0:
        return {}
    return {
        f"p{quantile:02d}": round(float(np.percentile(values, quantile)), 6)
        for quantile in QUANTILE_KEYS
    }


def build_metadata(
    *,
    dataset: DatasetReader,
    sources: list[Path],
    preset: str,
    source_code: str,
    source_label: str,
    dataset_year: int | None,
    dataset_version: str | None,
    checksum: str,
    stats: dict[str, Any],
) -> dict[str, Any]:
    transform = dataset.transform
    return {
        "sourceCode": source_code or preset,
        "sourceLabel": source_label,
        "datasetYear": dataset_year,
        "datasetVersion": dataset_version,
        "importedAt": datetime.now(UTC).isoformat(),
        "originalFileNames": [source.name for source in sources],
        "checksumSha256": checksum,
        "crs": str(dataset.crs),
        "width": dataset.width,
        "height": dataset.height,
        "pixelSizeDegrees": {
            "x": abs(transform.a),
            "y": abs(transform.e),
        },
        "band": 1,
        "unit": "nW/cm^2/sr",
        "nodata": dataset.nodata,
        "validPixelCount": stats["validPixelCount"],
        "negativeRadiancePixelCount": stats["negativeRadiancePixelCount"],
        "zeroRadiancePixelCount": stats["zeroRadiancePixelCount"],
        "positiveRadiancePixelCount": stats["positiveRadiancePixelCount"],
        "rawMinimumRadiance": stats["rawMinimumRadiance"],
        "rawMaximumRadiance": stats["rawMaximumRadiance"],
        "minimumRadiance": stats["minimumRadiance"],
        "maximumRadiance": stats["maximumRadiance"],
        "quantiles": stats["quantiles"],
        "statsSampleCount": stats["statsSampleCount"],
        "statsSampleCapacity": stats["statsSampleCapacity"],
        "positiveRadianceStatsSampleCount": stats["positiveRadianceStatsSampleCount"],
        "positiveRadianceQuantiles": stats["positiveRadianceQuantiles"],
        "statsAlgorithmVersion": stats["statsAlgorithmVersion"],
        "geographicBounds": {
            "west": dataset.bounds.left,
            "south": dataset.bounds.bottom,
            "east": dataset.bounds.right,
            "north": dataset.bounds.top,
        },
        "importerVersion": IMPORTER_VERSION,
        "preset": preset,
        "outputFormat": "COG",
    }


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
                    "pixelSizeDegrees": {"x": abs(dataset.transform.a), "y": abs(dataset.transform.e)},
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
