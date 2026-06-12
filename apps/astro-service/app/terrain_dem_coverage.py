from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import math
from pathlib import Path
import shlex
from typing import Any, Iterable

from .models import (
    TerrainDemBounds,
    TerrainDemCoordinateCoverage,
    TerrainDemCoverageImportReadiness,
    TerrainDemCoverageStatusResponse,
    TerrainDemTile,
    TerrainDemTileCoverageDiagnostics,
)


DEFAULT_DATASET_KEY = "copernicus-dem-glo-90"
DEFAULT_DATA_DIR = Path("/app/data/terrain-dem")
EARTH_RADIUS_KM_PER_DEGREE = 111.32


@dataclass(frozen=True)
class CopernicusDemDataset:
    key: str
    source_name: str
    dataset_name: str
    dataset_version: str
    dataset_year: int
    resolution_code: str
    resolution_meters: float
    bucket_url: str
    vertical_unit: str = "meter"


COPERNICUS_DATASETS: dict[str, CopernicusDemDataset] = {
    "copernicus-dem-glo-90": CopernicusDemDataset(
        key="copernicus-dem-glo-90",
        source_name="Copernicus DEM GLO-90 COG",
        dataset_name="Copernicus DEM GLO-90",
        dataset_version="2021",
        dataset_year=2021,
        resolution_code="30",
        resolution_meters=90.0,
        bucket_url="https://copernicus-dem-90m.s3.amazonaws.com",
    ),
    "copernicus-dem-glo-30": CopernicusDemDataset(
        key="copernicus-dem-glo-30",
        source_name="Copernicus DEM GLO-30 Public COG",
        dataset_name="Copernicus DEM GLO-30 Public",
        dataset_version="2021",
        dataset_year=2021,
        resolution_code="10",
        resolution_meters=30.0,
        bucket_url="https://copernicus-dem-30m.s3.amazonaws.com",
    ),
}


def dataset_profile(dataset_key: str | None = None) -> CopernicusDemDataset:
    normalized = (dataset_key or DEFAULT_DATASET_KEY).strip().lower()
    if normalized not in COPERNICUS_DATASETS:
        valid = ", ".join(sorted(COPERNICUS_DATASETS))
        raise ValueError(f"unsupported DEM dataset '{dataset_key}'; expected one of: {valid}")
    return COPERNICUS_DATASETS[normalized]


def resolve_copernicus_dem_tile_id(
    latitude: float,
    longitude: float,
    *,
    dataset_key: str | None = None,
) -> str:
    dataset = dataset_profile(dataset_key)
    tile_latitude, tile_longitude = resolve_copernicus_tile_origin(latitude, longitude)
    return tile_id_for_origin(tile_latitude, tile_longitude, dataset=dataset)


def resolve_copernicus_tile_origin(latitude: float, longitude: float) -> tuple[int, int]:
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("coordinates must be finite")
    if latitude < -90 or latitude >= 90:
        raise ValueError("latitude must be in [-90, 90) for 1-degree DEM tile resolution")
    if longitude < -180 or longitude >= 180:
        raise ValueError("longitude must be in [-180, 180) for 1-degree DEM tile resolution")
    return math.floor(latitude), math.floor(longitude)


def tile_id_for_origin(
    tile_latitude: int,
    tile_longitude: int,
    *,
    dataset: CopernicusDemDataset,
) -> str:
    return (
        f"Copernicus_DSM_COG_{dataset.resolution_code}_"
        f"{latitude_token(tile_latitude)}_{longitude_token(tile_longitude)}_DEM"
    )


def latitude_token(tile_latitude: int) -> str:
    prefix = "N" if tile_latitude >= 0 else "S"
    return f"{prefix}{abs(tile_latitude):02d}_00"


def longitude_token(tile_longitude: int) -> str:
    prefix = "E" if tile_longitude >= 0 else "W"
    return f"{prefix}{abs(tile_longitude):03d}_00"


def tile_bounds(tile_id: str) -> tuple[float, float, float, float]:
    parts = tile_id.split("_")
    if len(parts) < 9:
        raise ValueError(f"invalid Copernicus DEM tile id: {tile_id}")
    lat_token = parts[4]
    lon_token = parts[6]
    lat = int(lat_token[1:]) * (1 if lat_token[0] == "N" else -1)
    lon = int(lon_token[1:]) * (1 if lon_token[0] == "E" else -1)
    return float(lat), float(lon), float(lat + 1), float(lon + 1)


def suggested_download_url(tile_id: str, *, dataset_key: str | None = None) -> str:
    dataset = dataset_profile(dataset_key)
    return f"{dataset.bucket_url}/{tile_id}/{tile_id}.tif"


def required_tile_ids_for_bbox(
    *,
    south: float,
    west: float,
    north: float,
    east: float,
    dataset_key: str | None = None,
) -> list[str]:
    if not all(math.isfinite(value) for value in (south, west, north, east)):
        raise ValueError("bounding box coordinates must be finite")
    if south > north or west > east:
        raise ValueError("bounding box must be ordered as south <= north and west <= east")
    if south < -90 or north > 90 or west < -180 or east > 180:
        raise ValueError("bounding box must stay within WGS84 coordinate limits")

    if south == north and west == east:
        return [resolve_copernicus_dem_tile_id(south, west, dataset_key=dataset_key)]

    lat_start_min = math.floor(south)
    lat_start_max = math.ceil(north) - 1
    lon_start_min = math.floor(west)
    lon_start_max = math.ceil(east) - 1
    if north == south:
        lat_start_max = lat_start_min
    if east == west:
        lon_start_max = lon_start_min

    dataset = dataset_profile(dataset_key)
    tile_ids: list[str] = []
    for tile_latitude in range(lat_start_min, lat_start_max + 1):
        for tile_longitude in range(lon_start_min, lon_start_max + 1):
            if -90 <= tile_latitude < 90 and -180 <= tile_longitude < 180:
                tile_ids.append(tile_id_for_origin(tile_latitude, tile_longitude, dataset=dataset))
    return sort_tile_ids(set(tile_ids))


def bbox_for_center_radius(
    *,
    latitude: float,
    longitude: float,
    radius_km: float,
) -> tuple[float, float, float, float]:
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not math.isfinite(radius_km):
        raise ValueError("center coordinate and radius must be finite")
    if radius_km < 0:
        raise ValueError("radius_km must be non-negative")
    resolve_copernicus_tile_origin(latitude, longitude)
    latitude_delta = radius_km / EARTH_RADIUS_KM_PER_DEGREE
    cos_latitude = max(0.01, abs(math.cos(math.radians(latitude))))
    longitude_delta = radius_km / (EARTH_RADIUS_KM_PER_DEGREE * cos_latitude)
    return (
        max(-90.0, latitude - latitude_delta),
        max(-180.0, longitude - longitude_delta),
        min(89.999999, latitude + latitude_delta),
        min(179.999999, longitude + longitude_delta),
    )


def required_tile_ids_for_coordinates(
    coordinates: Iterable[tuple[float, float]],
    *,
    dataset_key: str | None = None,
) -> list[str]:
    return sort_tile_ids(
        resolve_copernicus_dem_tile_id(latitude, longitude, dataset_key=dataset_key)
        for latitude, longitude in coordinates
    )


def build_tile_record(
    tile_id: str,
    *,
    data_dir: Path = DEFAULT_DATA_DIR,
    dataset_key: str | None = None,
) -> TerrainDemTile:
    dataset = dataset_profile(dataset_key)
    south, west, north, east = tile_bounds(tile_id)
    local_path, file_exists = resolve_tile_file_path(data_dir, tile_id)
    metadata_path = resolve_tile_metadata_path(data_dir, tile_id)
    metadata = read_json_safe(metadata_path) if metadata_path else None
    checksum = read_checksum(data_dir, tile_id, metadata)
    file_size = local_path.stat().st_size if file_exists else None
    status = "invalid" if file_exists and file_size == 0 else "available" if file_exists else "missing"
    notes = tile_notes(file_exists=file_exists, metadata_path=metadata_path, file_size=file_size)
    return TerrainDemTile(
        tileId=tile_id,
        sourceName=safe_str(metadata.get("sourceName") if metadata else None) or dataset.source_name,
        datasetName=safe_str(metadata.get("datasetName") if metadata else None) or dataset.dataset_name,
        datasetVersion=(
            safe_str(metadata.get("datasetVersion") if metadata else None) or dataset.dataset_version
        ),
        datasetYear=safe_int(metadata.get("datasetYear") if metadata else None)
        or dataset.dataset_year,
        minLatitude=south,
        maxLatitude=north,
        minLongitude=west,
        maxLongitude=east,
        localPath=str(local_path),
        fileExists=file_exists,
        metadataExists=metadata_path is not None and metadata_path.exists(),
        checksum=checksum,
        importedAt=safe_str(metadata.get("importedAt") if metadata else None),
        status=status,  # type: ignore[arg-type]
        resolutionMeters=dataset.resolution_meters,
        verticalUnit=safe_str(metadata.get("verticalUnit") if metadata else None) or dataset.vertical_unit,
        notes=notes,
    )


def coverage_for_coordinate(
    latitude: float,
    longitude: float,
    *,
    data_dir: Path = DEFAULT_DATA_DIR,
    active_bounds: TerrainDemBounds | None = None,
    dataset_key: str | None = None,
) -> TerrainDemTileCoverageDiagnostics:
    try:
        tile_id = resolve_copernicus_dem_tile_id(latitude, longitude, dataset_key=dataset_key)
        tile = build_tile_record(tile_id, data_dir=data_dir, dataset_key=dataset_key)
        covered = coordinate_within_active_bounds(latitude, longitude, active_bounds)
        return TerrainDemTileCoverageDiagnostics(
            requiredTileId=tile_id,
            status=tile.status,
            coveredByActiveDataset=covered,
            tileFileExists=tile.fileExists,
            tileMetadataExists=tile.metadataExists,
            sourceName=tile.sourceName,
            datasetName=tile.datasetName,
            datasetVersion=tile.datasetVersion,
            datasetYear=tile.datasetYear,
            resolutionMeters=tile.resolutionMeters,
            localPath=tile.localPath,
            noteZh=coverage_note_zh(tile.status, covered, tile_id),
        )
    except ValueError as exc:
        return TerrainDemTileCoverageDiagnostics(
            requiredTileId=None,
            status="invalid",
            coveredByActiveDataset=False,
            tileFileExists=False,
            tileMetadataExists=False,
            sourceName=dataset_profile(dataset_key).source_name,
            datasetName=dataset_profile(dataset_key).dataset_name,
            datasetVersion=dataset_profile(dataset_key).dataset_version,
            datasetYear=dataset_profile(dataset_key).dataset_year,
            resolutionMeters=dataset_profile(dataset_key).resolution_meters,
            localPath=None,
            noteZh=f"坐标无法解析 DEM 瓦片：{exc}",
        )


def build_coverage_status(
    *,
    required_tile_ids: Iterable[str],
    coordinates: Iterable[tuple[float, float]] = (),
    data_dir: Path = DEFAULT_DATA_DIR,
    active_bounds: TerrainDemBounds | None = None,
    dataset_key: str | None = None,
) -> TerrainDemCoverageStatusResponse:
    dataset = dataset_profile(dataset_key)
    tile_ids = sort_tile_ids(set(required_tile_ids))
    tiles = [build_tile_record(tile_id, data_dir=data_dir, dataset_key=dataset.key) for tile_id in tile_ids]
    existing_tile_ids = [tile.tileId for tile in tiles if tile.status == "available"]
    missing_tile_ids = [tile.tileId for tile in tiles if tile.status != "available"]
    coordinate_statuses = [
        coordinate_coverage(latitude, longitude, data_dir=data_dir, active_bounds=active_bounds, dataset_key=dataset.key)
        for latitude, longitude in coordinates
    ]
    return TerrainDemCoverageStatusResponse(
        datasetKey=dataset.key,
        sourceName=dataset.source_name,
        datasetName=dataset.dataset_name,
        datasetVersion=dataset.dataset_version,
        datasetYear=dataset.dataset_year,
        activeDatasetBounds=active_bounds,
        activeDatasetTileCount=active_dataset_tile_count(active_bounds, dataset_key=dataset.key),
        requiredTileIds=tile_ids,
        existingTileIds=existing_tile_ids,
        missingTileIds=missing_tile_ids,
        requiredTileCount=len(tile_ids),
        availableTileCount=len(existing_tile_ids),
        missingTileCount=len(missing_tile_ids),
        estimatedFileCount=len(tile_ids),
        estimatedLocalPaths=[tile.localPath for tile in tiles],
        suggestedDownloadUrls=[suggested_download_url(tile_id, dataset_key=dataset.key) for tile_id in missing_tile_ids],
        tiles=tiles,
        coordinateCoverage=coordinate_statuses,
        allCoordinatesCoveredByActiveDataset=all_coordinates_covered(coordinate_statuses),
        importReadiness=TerrainDemCoverageImportReadiness(
            readyForImport=len(missing_tile_ids) == 0 and len(tile_ids) > 0,
            reasonZh=import_readiness_reason(missing_tile_ids, tile_ids),
            importCommand=suggest_import_command(tiles) if len(missing_tile_ids) == 0 and len(tile_ids) > 0 else None,
        ),
        generatedAt=datetime.now(UTC).isoformat(),
    )


def coordinate_coverage(
    latitude: float,
    longitude: float,
    *,
    data_dir: Path,
    active_bounds: TerrainDemBounds | None,
    dataset_key: str,
) -> TerrainDemCoordinateCoverage:
    coverage = coverage_for_coordinate(
        latitude,
        longitude,
        data_dir=data_dir,
        active_bounds=active_bounds,
        dataset_key=dataset_key,
    )
    return TerrainDemCoordinateCoverage(
        latitudeWgs84=latitude,
        longitudeWgs84=longitude,
        validCoordinate=coverage.requiredTileId is not None,
        requiredTileId=coverage.requiredTileId,
        coveredByActiveDataset=coverage.coveredByActiveDataset,
        tileStatus=coverage.status,
        noteZh=coverage.noteZh,
    )


def load_active_bounds(metadata_path: Path) -> TerrainDemBounds | None:
    metadata = read_json_safe(metadata_path)
    if not metadata:
        return None
    raw = metadata.get("bounds") or metadata.get("geographicBounds")
    if not isinstance(raw, dict):
        return None
    south = safe_float(raw.get("south"))
    west = safe_float(raw.get("west"))
    north = safe_float(raw.get("north"))
    east = safe_float(raw.get("east"))
    if None in (south, west, north, east):
        return None
    return TerrainDemBounds(west=west, south=south, east=east, north=north)  # type: ignore[arg-type]


def coordinate_within_active_bounds(
    latitude: float,
    longitude: float,
    bounds: TerrainDemBounds | None,
) -> bool:
    if bounds is None:
        return False
    return bounds.south <= latitude <= bounds.north and bounds.west <= longitude <= bounds.east


def active_dataset_tile_count(
    bounds: TerrainDemBounds | None,
    *,
    dataset_key: str,
) -> int:
    if bounds is None:
        return 0
    try:
        return len(
            required_tile_ids_for_bbox(
                south=bounds.south,
                west=bounds.west,
                north=bounds.north,
                east=bounds.east,
                dataset_key=dataset_key,
            )
        )
    except ValueError:
        return 0


def load_region_config(name: str, *, data_dir: Path = DEFAULT_DATA_DIR) -> dict[str, Any]:
    safe_name = name.strip()
    if not safe_name or any(part in safe_name for part in ("..", "/", "\\")):
        raise ValueError("region name must be a simple config id")
    candidates = [
        data_dir / "regions" / f"{safe_name}.json",
        Path.cwd() / "deploy" / "terrain-dem" / "regions" / f"{safe_name}.json",
    ]
    for path in candidates:
        if path.exists():
            content = read_json_safe(path)
            if not isinstance(content, dict):
                raise ValueError(f"region config is not an object: {path}")
            return content
    raise FileNotFoundError(f"region config not found: {safe_name}")


def tile_ids_from_region_config(
    config: dict[str, Any],
    *,
    dataset_key: str | None = None,
) -> list[str]:
    tile_ids: set[str] = set()
    bbox = config.get("bbox")
    if isinstance(bbox, dict):
        tile_ids.update(
            required_tile_ids_for_bbox(
                south=float(bbox["south"]),
                west=float(bbox["west"]),
                north=float(bbox["north"]),
                east=float(bbox["east"]),
                dataset_key=dataset_key,
            )
        )
    coordinates = config.get("coordinates")
    if isinstance(coordinates, list):
        parsed_coordinates = []
        for item in coordinates:
            if not isinstance(item, dict):
                continue
            parsed_coordinates.append((float(item["latitude"]), float(item["longitude"])))
        tile_ids.update(required_tile_ids_for_coordinates(parsed_coordinates, dataset_key=dataset_key))
    return sort_tile_ids(tile_ids)


def download_commands_for_tiles(
    tile_ids: Iterable[str],
    *,
    dataset_key: str | None = None,
    output_dir: str = "deploy/terrain-dem/incoming",
) -> list[str]:
    commands: list[str] = []
    for tile_id in sort_tile_ids(tile_ids):
        target_dir = f"{output_dir.rstrip('/')}/{tile_id}"
        target_path = f"{target_dir}/{tile_id}.tif"
        url = suggested_download_url(tile_id, dataset_key=dataset_key)
        commands.append(f"mkdir -p {shlex.quote(target_dir)}")
        commands.append(
            "curl -fL --retry 5 --retry-delay 3 -C - "
            f"-o {shlex.quote(target_path)} {shlex.quote(url)}"
        )
    return commands


def sort_tile_ids(tile_ids: Iterable[str]) -> list[str]:
    return sorted(dict.fromkeys(tile_ids), key=tile_sort_key)


def tile_sort_key(tile_id: str) -> tuple[float, float, str]:
    try:
        south, west, _, _ = tile_bounds(tile_id)
        return south, west, tile_id
    except ValueError:
        return 999.0, 999.0, tile_id


def resolve_tile_file_path(data_dir: Path, tile_id: str) -> tuple[Path, bool]:
    candidates = [
        data_dir / "incoming" / tile_id / f"{tile_id}.tif",
        data_dir / "incoming" / tile_id / f"{tile_id}.tiff",
        data_dir / "incoming" / f"{tile_id}.tif",
        data_dir / "incoming" / f"{tile_id}.tiff",
        data_dir / "current" / "tiles" / tile_id / f"{tile_id}.tif",
        data_dir / "current" / "tiles" / f"{tile_id}.tif",
    ]
    for path in candidates:
        if path.exists():
            return path, True
    return candidates[0], False


def resolve_tile_metadata_path(data_dir: Path, tile_id: str) -> Path | None:
    candidates = [
        data_dir / "incoming" / tile_id / "metadata.json",
        data_dir / "incoming" / tile_id / f"{tile_id}.json",
        data_dir / "incoming" / f"{tile_id}.json",
        data_dir / "current" / "tiles" / tile_id / "metadata.json",
    ]
    return next((path for path in candidates if path.exists()), candidates[0])


def read_checksum(
    data_dir: Path,
    tile_id: str,
    metadata: dict[str, Any] | None,
) -> str | None:
    for path in (
        data_dir / "incoming" / tile_id / "checksum.sha256",
        data_dir / "incoming" / tile_id / f"{tile_id}.sha256",
        data_dir / "incoming" / f"{tile_id}.sha256",
    ):
        if path.exists():
            text = path.read_text(encoding="utf-8").strip()
            return text.split()[0] if text else None
    return safe_str(metadata.get("checksumSha256") if metadata else None)


def read_json_safe(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return content if isinstance(content, dict) else None


def tile_notes(*, file_exists: bool, metadata_path: Path | None, file_size: int | None) -> str | None:
    if file_exists and file_size == 0:
        return "Tile file exists but is empty; operator should replace it before import."
    if file_exists and (metadata_path is None or not metadata_path.exists()):
        return "Tile file exists; sidecar metadata is optional before import."
    if not file_exists:
        return "Tile is not present locally; generate a reviewed download command list before importing."
    return None


def coverage_note_zh(status: str, covered: bool, tile_id: str) -> str:
    if covered:
        return "当前坐标已落在激活 DEM 数据集覆盖范围内。"
    if status == "available":
        return f"所需 DEM 瓦片 {tile_id} 已在本地待导入目录中，但当前激活数据集尚未覆盖该坐标。"
    if status == "missing":
        return f"当前激活 DEM 未覆盖该坐标；需要补充 DEM 瓦片 {tile_id}。"
    if status == "invalid":
        return f"所需 DEM 瓦片 {tile_id} 本地文件无效，需重新获取后再导入。"
    return "DEM 覆盖状态待确认。"


def all_coordinates_covered(
    coordinate_statuses: list[TerrainDemCoordinateCoverage],
) -> bool | None:
    if not coordinate_statuses:
        return None
    return all(item.coveredByActiveDataset for item in coordinate_statuses)


def import_readiness_reason(missing_tile_ids: list[str], tile_ids: list[str]) -> str:
    if not tile_ids:
        return "未提供坐标、范围或区域配置，暂无可导入瓦片。"
    if missing_tile_ids:
        return f"仍缺少 {len(missing_tile_ids)} 个 DEM 瓦片；先生成下载计划并人工复核。"
    return "所需瓦片均已在本地待导入目录中，可运行导入命令生成激活 DEM。"


def suggest_import_command(tiles: list[TerrainDemTile]) -> str:
    directories = sort_tile_ids(tile.tileId for tile in tiles if tile.status == "available")
    if not directories:
        return "bash scripts/import-terrain-dem.sh incoming/<tile-directory>"
    return "bash scripts/import-terrain-dem.sh " + " ".join(f"incoming/{tile_id}" for tile_id in directories)


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
