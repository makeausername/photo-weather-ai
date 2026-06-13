from __future__ import annotations

import argparse
from contextlib import ExitStack
from datetime import UTC, datetime
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
    from rasterio.io import DatasetReader
except Exception as exc:  # pragma: no cover - import failure is reported by CLI entrypoint.
    raise SystemExit(f"sky-brightness raster dependencies are unavailable: {exc}") from exc

from scripts.import_light_pollution import (
    discover_sources,
    sha256_file,
    validate_sources,
    write_cog,
    write_epsg4326_mosaic,
)


IMPORTER_VERSION = "sky-brightness-import-v1"
DEFAULT_DATA_DIR = Path("/app/data/sky-brightness")
CURRENT_FILES = {
    "raster": "sky-brightness.cog.tif",
    "metadata": "metadata.json",
    "checksum": "checksum.sha256",
}
VALUE_TYPES = (
    "sqm",
    "artificial_brightness_mcd_m2",
    "ratio_to_natural",
    "radiance",
    "bortle_class",
    "unknown",
)
QUANTILE_POINTS = (1, 5, 10, 25, 50, 75, 90, 95, 99)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    data_dir = Path(args.data_dir)

    if args.check:
        report_current_dataset(data_dir, as_json=args.json)
        return 0

    sources = discover_sources(args.source)
    if not sources:
        parser.error("at least one local GeoTIFF source file or directory is required")

    import_dataset(
        sources=sources,
        data_dir=data_dir,
        dataset_name=args.dataset_name,
        dataset_year=args.dataset_year,
        dataset_version=args.dataset_version,
        source_name=args.source_name,
        source_type=args.source_type,
        value_type=args.value_type,
        value_unit=args.value_unit,
        notes=args.notes,
        keep_backups=args.keep_backups,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Import an operator-provided WA/model sky-brightness GeoTIFF dataset; "
            "this importer does not download data."
        ),
    )
    parser.add_argument("source", nargs="*", help="GeoTIFF file(s), tile directory, or files under incoming/.")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Sky-brightness data directory.")
    parser.add_argument("--dataset-name", default="World Atlas-style modeled sky brightness")
    parser.add_argument("--dataset-year", type=int)
    parser.add_argument("--dataset-version")
    parser.add_argument("--source-name", default="operator-provided sky brightness raster")
    parser.add_argument("--source-type", default="modeled_sky_brightness")
    parser.add_argument("--value-type", choices=VALUE_TYPES, default="unknown")
    parser.add_argument("--value-unit")
    parser.add_argument("--notes", action="append", default=[])
    parser.add_argument("--keep-backups", type=int, default=3)
    parser.add_argument("--check", action="store_true", help="Inspect the active dataset instead of importing.")
    parser.add_argument("--json", action="store_true", help="Print inspection output as JSON.")
    return parser


def import_dataset(
    *,
    sources: list[Path],
    data_dir: Path,
    dataset_name: str,
    dataset_year: int | None,
    dataset_version: str | None,
    source_name: str,
    source_type: str,
    value_type: str,
    value_unit: str | None,
    notes: list[str],
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
    if value_type == "unknown":
        print("valueType is unknown; queries will expose raw values but will not derive SQM or Bortle precision.")

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    staging_dir = Path(tempfile.mkdtemp(prefix=f".sky-brightness-import-{timestamp}-", dir=str(data_dir)))
    try:
        staged_tiff = staging_dir / CURRENT_FILES["raster"]
        staged_metadata = staging_dir / CURRENT_FILES["metadata"]
        staged_checksum = staging_dir / CURRENT_FILES["checksum"]

        with ExitStack() as stack:
            datasets = [stack.enter_context(rasterio.open(source)) for source in sources]
            validate_sources(datasets)
            working_tiff = staging_dir / "working-epsg4326.tif"
            write_epsg4326_mosaic(datasets, working_tiff)

        stats = calculate_value_stats(working_tiff)
        if stats["validPixelCount"] <= 0:
            raise ValueError("import rejected: dataset has no finite valid pixels")

        write_cog(working_tiff, staged_tiff)
        checksum = sha256_file(staged_tiff)
        staged_checksum.write_text(f"{checksum}  {CURRENT_FILES['raster']}\n", encoding="utf-8")

        with rasterio.open(staged_tiff) as dataset:
            metadata = build_metadata(
                dataset=dataset,
                sources=sources,
                dataset_name=dataset_name,
                dataset_year=dataset_year,
                dataset_version=dataset_version,
                source_name=source_name,
                source_type=source_type,
                value_type=value_type,
                value_unit=value_unit,
                notes=notes,
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
        print(f"OK imported sky-brightness dataset checksum={checksum[:12]} files={len(sources)}")
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise


def calculate_value_stats(path: Path) -> dict[str, Any]:
    valid_count = 0
    raw_min_value = math.inf
    raw_max_value = -math.inf
    sample_values: list[float] = []
    with rasterio.open(path) as dataset:
        for _, window in dataset.block_windows(1):
            block = dataset.read(1, window=window, masked=True)
            masked = np.ma.asarray(block)
            data = masked.filled(np.nan).astype("float64", copy=False)
            valid_mask = ~np.ma.getmaskarray(masked) & np.isfinite(data)
            if not np.any(valid_mask):
                continue
            values = data[valid_mask]
            valid_count += int(values.size)
            raw_min_value = min(raw_min_value, float(values.min()))
            raw_max_value = max(raw_max_value, float(values.max()))
            if len(sample_values) < 200_000:
                sample_values.extend(float(value) for value in values[: max(0, 200_000 - len(sample_values))])

    return {
        "validPixelCount": valid_count,
        "minimumValue": round(float(raw_min_value), 6) if valid_count > 0 else None,
        "maximumValue": round(float(raw_max_value), 6) if valid_count > 0 else None,
        "quantiles": quantiles(sample_values),
        "statsSampleCount": len(sample_values),
        "statsAlgorithmVersion": "first-valid-block-sample-v1",
    }


def quantiles(values: list[float]) -> dict[str, float]:
    finite = np.array([value for value in values if math.isfinite(value)], dtype="float64")
    if finite.size == 0:
        return {}
    return {f"p{point:02d}": round(float(np.percentile(finite, point)), 6) for point in QUANTILE_POINTS}


def build_metadata(
    *,
    dataset: DatasetReader,
    sources: list[Path],
    dataset_name: str,
    dataset_year: int | None,
    dataset_version: str | None,
    source_name: str,
    source_type: str,
    value_type: str,
    value_unit: str | None,
    notes: list[str],
    checksum: str,
    stats: dict[str, Any],
) -> dict[str, Any]:
    transform = dataset.transform
    return {
        "datasetExists": True,
        "metadataExists": True,
        "datasetName": dataset_name,
        "datasetVersion": dataset_version,
        "datasetYear": dataset_year,
        "sourceName": source_name,
        "sourceType": source_type,
        "valueType": value_type,
        "valueUnit": value_unit,
        "crs": str(dataset.crs),
        "width": dataset.width,
        "height": dataset.height,
        "bounds": {
            "west": dataset.bounds.left,
            "south": dataset.bounds.bottom,
            "east": dataset.bounds.right,
            "north": dataset.bounds.top,
        },
        "resolution": {
            "xDegrees": abs(transform.a),
            "yDegrees": abs(transform.e),
        },
        "noDataValue": dataset.nodata,
        "checksumSha256": checksum,
        "importedAt": datetime.now(UTC).isoformat(),
        "rasterPath": f"{DEFAULT_DATA_DIR}/current/{CURRENT_FILES['raster']}",
        "healthStatus": "available",
        "loadError": None,
        "notes": [
            "Operator-provided raster; no data was downloaded by this importer.",
            "Modeled sky brightness is not measured SQM and is not an official classification.",
            *notes,
        ],
        "originalFileNames": [source.name for source in sources],
        "band": 1,
        "validPixelCount": stats["validPixelCount"],
        "minimumValue": stats["minimumValue"],
        "maximumValue": stats["maximumValue"],
        "quantiles": stats["quantiles"],
        "statsSampleCount": stats["statsSampleCount"],
        "statsAlgorithmVersion": stats["statsAlgorithmVersion"],
        "importerVersion": IMPORTER_VERSION,
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
        "datasetExists": raster_path.exists(),
        "metadataExists": metadata_path.exists(),
        "checksumExists": checksum_path.exists(),
        "rasterPath": str(raster_path),
        "healthStatus": "missing" if not raster_path.exists() else "metadata_missing",
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
                    "resolution": {"xDegrees": abs(dataset.transform.a), "yDegrees": abs(dataset.transform.e)},
                }
                report["healthStatus"] = "available" if metadata_path.exists() else "metadata_missing"
        except Exception as exc:
            report["healthStatus"] = "unreadable"
            report["loadError"] = f"{type(exc).__name__}: {exc}"
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return
    for key, value in report.items():
        if isinstance(value, (dict, list, tuple)):
            print(f"{key}: {json.dumps(value, ensure_ascii=False, sort_keys=True)}")
        else:
            print(f"{key}: {value}")


if __name__ == "__main__":
    sys.exit(main())
