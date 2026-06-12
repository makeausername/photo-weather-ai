from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from app.terrain_dem_coverage import (
    DEFAULT_DATA_DIR,
    build_coverage_status,
    bbox_for_center_radius,
    dataset_profile,
    download_commands_for_tiles,
    load_active_bounds,
    load_region_config,
    required_tile_ids_for_bbox,
    required_tile_ids_for_coordinates,
    resolve_copernicus_dem_tile_id,
    tile_ids_from_region_config,
)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.download:
        parser.error(
            "--download is intentionally not implemented. Generate a reviewed command list with "
            "--commands or --write-download-script, then run it manually as an operator."
        )

    data_dir = Path(args.data_dir)
    dataset = dataset_profile(args.dataset)
    coordinates: list[tuple[float, float]] = []
    requested_tile_ids: set[str] = set()

    if args.center:
        center_latitude, center_longitude = parse_coordinate(args.center)
        coordinates.append((center_latitude, center_longitude))
        if args.radius_km is None:
            requested_tile_ids.add(
                resolve_copernicus_dem_tile_id(
                    center_latitude,
                    center_longitude,
                    dataset_key=dataset.key,
                )
            )
        else:
            south, west, north, east = bbox_for_center_radius(
                latitude=center_latitude,
                longitude=center_longitude,
                radius_km=args.radius_km,
            )
            requested_tile_ids.update(
                required_tile_ids_for_bbox(
                    south=south,
                    west=west,
                    north=north,
                    east=east,
                    dataset_key=dataset.key,
                )
            )

    if args.center_lat is not None or args.center_lon is not None:
        if args.center_lat is None or args.center_lon is None:
            parser.error("--center-lat and --center-lon must be supplied together")
        coordinates.append((args.center_lat, args.center_lon))
        if args.radius_km is None:
            requested_tile_ids.add(
                resolve_copernicus_dem_tile_id(
                    args.center_lat,
                    args.center_lon,
                    dataset_key=dataset.key,
                )
            )
        else:
            south, west, north, east = bbox_for_center_radius(
                latitude=args.center_lat,
                longitude=args.center_lon,
                radius_km=args.radius_km,
            )
            requested_tile_ids.update(
                required_tile_ids_for_bbox(
                    south=south,
                    west=west,
                    north=north,
                    east=east,
                    dataset_key=dataset.key,
                )
            )

    for bbox in args.bbox or []:
        south, west, north, east = parse_bbox(bbox)
        requested_tile_ids.update(
            required_tile_ids_for_bbox(
                south=south,
                west=west,
                north=north,
                east=east,
                dataset_key=dataset.key,
            )
        )

    for raw_coordinate in args.coordinate or []:
        coordinates.append(parse_coordinate(raw_coordinate))

    for coordinates_file in args.coordinates_file or []:
        coordinates.extend(load_coordinates_file(Path(coordinates_file)))

    if coordinates:
        requested_tile_ids.update(
            required_tile_ids_for_coordinates(coordinates, dataset_key=dataset.key)
        )

    for region_name in args.region or []:
        config = load_region_config(region_name, data_dir=data_dir)
        requested_tile_ids.update(tile_ids_from_region_config(config, dataset_key=dataset.key))

    active_bounds = load_active_bounds(data_dir / "current" / "metadata.json")
    status = build_coverage_status(
        required_tile_ids=requested_tile_ids,
        coordinates=coordinates,
        data_dir=data_dir,
        active_bounds=active_bounds,
        dataset_key=dataset.key,
    )
    payload = status.model_dump(mode="json")
    commands = download_commands_for_tiles(
        status.missingTileIds,
        dataset_key=dataset.key,
        output_dir=args.download_output_dir,
    )
    payload["downloadCommands"] = commands

    if args.write_download_script:
        write_download_script(Path(args.write_download_script), commands)

    if args.commands:
        for command in commands:
            print(command)
        return 0

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    print_text_report(payload)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Plan national-scale local terrain DEM tile coverage without downloading by default."
    )
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Terrain DEM data directory.")
    parser.add_argument(
        "--dataset",
        default="copernicus-dem-glo-90",
        choices=["copernicus-dem-glo-90", "copernicus-dem-glo-30"],
        help="Copernicus DEM COG tile set to plan.",
    )
    parser.add_argument("--center", help="Center coordinate as LAT,LON.")
    parser.add_argument("--center-lat", type=float)
    parser.add_argument("--center-lon", type=float)
    parser.add_argument("--radius-km", type=float, help="Radius around center coordinate.")
    parser.add_argument(
        "--bbox",
        action="append",
        help="Bounding box as SOUTH,WEST,NORTH,EAST. Can be supplied more than once.",
    )
    parser.add_argument(
        "--coordinate",
        action="append",
        help="Coordinate as LAT,LON. Can be supplied more than once.",
    )
    parser.add_argument(
        "--coordinates-file",
        action="append",
        help="Text file with LAT,LON per line, or JSON array of {latitude, longitude}.",
    )
    parser.add_argument(
        "--region",
        action="append",
        help="Named region config under deploy/terrain-dem/regions or data-dir/regions.",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON report.")
    parser.add_argument("--commands", action="store_true", help="Print reviewed download commands only.")
    parser.add_argument(
        "--write-download-script",
        help="Write a shell script with reviewed download commands; does not execute it.",
    )
    parser.add_argument(
        "--download-output-dir",
        default="deploy/terrain-dem/incoming",
        help="Host path prefix used in generated command lists.",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Reserved explicit mode. Currently errors rather than downloading automatically.",
    )
    return parser


def parse_coordinate(value: str) -> tuple[float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(f"coordinate must be LAT,LON: {value}")
    try:
        return float(parts[0]), float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"coordinate must be numeric: {value}") from exc


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(f"bbox must be SOUTH,WEST,NORTH,EAST: {value}")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"bbox must be numeric: {value}") from exc
    return south, west, north, east


def load_coordinates_file(path: Path) -> list[tuple[float, float]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if text.startswith("["):
        content = json.loads(text)
        if not isinstance(content, list):
            raise ValueError("coordinates JSON must be an array")
        coordinates: list[tuple[float, float]] = []
        for item in content:
            if not isinstance(item, dict):
                raise ValueError("coordinates JSON items must be objects")
            coordinates.append((float(item["latitude"]), float(item["longitude"])))
        return coordinates

    coordinates = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        coordinates.append(parse_coordinate(stripped))
    return coordinates


def write_download_script(path: Path, commands: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        "# Generated for operator review. It only downloads into deploy/terrain-dem/incoming.",
        "# Import/activation remains a separate scripts/import-terrain-dem.sh step.",
        *commands,
        "",
    ]
    path.write_text("\n".join(content), encoding="utf-8")


def print_text_report(payload: dict[str, Any]) -> None:
    print(f"dataset: {payload['datasetKey']}")
    print(f"requiredTileCount: {payload['requiredTileCount']}")
    print(f"availableTileCount: {payload['availableTileCount']}")
    print(f"missingTileCount: {payload['missingTileCount']}")
    print(f"importReady: {payload['importReadiness']['readyForImport']}")
    print(f"importReadiness: {payload['importReadiness']['reasonZh']}")
    print("requiredTileIds:")
    for tile_id in payload["requiredTileIds"]:
        print(f"  - {tile_id}")
    if payload["missingTileIds"]:
        print("missingTileIds:")
        for tile_id in payload["missingTileIds"]:
            print(f"  - {tile_id}")
    if payload["suggestedDownloadUrls"]:
        print("suggestedDownloadUrls:")
        for url in payload["suggestedDownloadUrls"]:
            print(f"  - {url}")
    if payload.get("downloadCommands"):
        print("downloadCommandsPreview:")
        for command in payload["downloadCommands"]:
            print(f"  {command}")


if __name__ == "__main__":
    sys.exit(main())
