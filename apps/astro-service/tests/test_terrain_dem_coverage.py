from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import TerrainDemBounds
from app.terrain_dem_coverage import (
    build_coverage_status,
    download_commands_for_tiles,
    required_tile_ids_for_bbox,
    required_tile_ids_for_coordinates,
    resolve_copernicus_dem_tile_id,
)
from scripts.plan_terrain_dem_tiles import main as plan_tiles_main


def test_copernicus_coordinate_to_tile_id_for_china_coordinates() -> None:
    assert (
        resolve_copernicus_dem_tile_id(30.1321, 118.1691)
        == "Copernicus_DSM_COG_30_N30_00_E118_00_DEM"
    )
    assert (
        resolve_copernicus_dem_tile_id(33.7852, 111.6402)
        == "Copernicus_DSM_COG_30_N33_00_E111_00_DEM"
    )
    assert (
        resolve_copernicus_dem_tile_id(30.1321, 118.1691, dataset_key="copernicus-dem-glo-30")
        == "Copernicus_DSM_COG_10_N30_00_E118_00_DEM"
    )


def test_copernicus_tile_id_handles_negative_and_boundary_coordinates() -> None:
    assert (
        resolve_copernicus_dem_tile_id(-1.2, -118.1)
        == "Copernicus_DSM_COG_30_S02_00_W119_00_DEM"
    )
    assert (
        resolve_copernicus_dem_tile_id(-30.0, -118.0)
        == "Copernicus_DSM_COG_30_S30_00_W118_00_DEM"
    )
    assert (
        resolve_copernicus_dem_tile_id(0.0, 0.0)
        == "Copernicus_DSM_COG_30_N00_00_E000_00_DEM"
    )
    assert (
        resolve_copernicus_dem_tile_id(31.0, 119.0)
        == "Copernicus_DSM_COG_30_N31_00_E119_00_DEM"
    )


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(90.0, 118.0), (30.0, 180.0), (float("nan"), 118.0), (30.0, float("inf"))],
)
def test_copernicus_tile_id_rejects_invalid_coordinates(latitude: float, longitude: float) -> None:
    with pytest.raises(ValueError):
        resolve_copernicus_dem_tile_id(latitude, longitude)


def test_bounding_box_tile_planning_is_deterministic() -> None:
    assert required_tile_ids_for_bbox(south=30, west=118, north=31, east=119) == [
        "Copernicus_DSM_COG_30_N30_00_E118_00_DEM"
    ]
    assert required_tile_ids_for_bbox(south=30.2, west=118.2, north=31.1, east=119.1) == [
        "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
        "Copernicus_DSM_COG_30_N30_00_E119_00_DEM",
        "Copernicus_DSM_COG_30_N31_00_E118_00_DEM",
        "Copernicus_DSM_COG_30_N31_00_E119_00_DEM",
    ]


def test_coordinate_list_planning_deduplicates_tiles() -> None:
    assert required_tile_ids_for_coordinates([(30.1, 118.1), (30.9, 118.9), (33.1, 111.1)]) == [
        "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
        "Copernicus_DSM_COG_30_N33_00_E111_00_DEM",
    ]


def test_coverage_status_detects_existing_and_missing_tiles(tmp_path: Path) -> None:
    existing_tile = "Copernicus_DSM_COG_30_N30_00_E118_00_DEM"
    missing_tile = "Copernicus_DSM_COG_30_N33_00_E111_00_DEM"
    tile_dir = tmp_path / "incoming" / existing_tile
    tile_dir.mkdir(parents=True)
    (tile_dir / f"{existing_tile}.tif").write_bytes(b"synthetic tile")
    (tile_dir / "metadata.json").write_text(
        json.dumps(
            {
                "sourceName": "Synthetic source",
                "datasetName": "Synthetic DEM",
                "datasetYear": 2026,
                "datasetVersion": "test-v1",
                "checksumSha256": "b" * 64,
                "importedAt": "2026-06-12T00:00:00+00:00",
                "verticalUnit": "meter",
            }
        ),
        encoding="utf-8",
    )

    status = build_coverage_status(
        required_tile_ids=[missing_tile, existing_tile],
        coordinates=[(30.2, 118.2), (33.2, 111.2)],
        data_dir=tmp_path,
        active_bounds=TerrainDemBounds(west=118, south=30, east=119, north=31),
    )

    assert status.existingTileIds == [existing_tile]
    assert status.missingTileIds == [missing_tile]
    assert status.availableTileCount == 1
    assert status.missingTileCount == 1
    assert status.coordinateCoverage[0].coveredByActiveDataset is True
    assert status.coordinateCoverage[1].coveredByActiveDataset is False
    assert status.tiles[0].checksum == "b" * 64


def test_download_command_list_is_deterministic_and_not_executed(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    plan_file = tmp_path / "download-plan.sh"
    exit_code = plan_tiles_main(
        [
            "--data-dir",
            str(tmp_path),
            "--coordinate",
            "33.7852,111.6402",
            "--coordinate",
            "30.1321,118.1691",
            "--write-download-script",
            str(plan_file),
            "--json",
        ]
    )
    output = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert output["missingTileIds"] == [
        "Copernicus_DSM_COG_30_N30_00_E118_00_DEM",
        "Copernicus_DSM_COG_30_N33_00_E111_00_DEM",
    ]
    assert output["downloadCommands"] == download_commands_for_tiles(output["missingTileIds"])
    assert plan_file.exists()
    assert not (tmp_path / "incoming" / "Copernicus_DSM_COG_30_N30_00_E118_00_DEM").exists()
    assert "curl -fL --retry 5 --retry-delay 3 -C -" in plan_file.read_text(encoding="utf-8")


def test_download_flag_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        plan_tiles_main(
            [
                "--data-dir",
                str(tmp_path),
                "--coordinate",
                "30.1321,118.1691",
                "--download",
            ]
        )
