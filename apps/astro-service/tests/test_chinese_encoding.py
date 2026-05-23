from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import EPHEMERIS_PATH, app


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
MOJIBAKE_MARKERS = (
    "閾",
    "銆",
    "锛",
    "掳",
    "鍖",
    "鏈",
    "澶",
    "浣",
    "闇",
    "€",
)

client = TestClient(app)


def assert_readable_chinese(value: str) -> None:
    assert value
    assert not any(marker in value for marker in MOJIBAKE_MARKERS), value
    assert any("\u4e00" <= char <= "\u9fff" for char in value), value


def collect_text_fields(body: dict) -> list[str]:
    values = [
        body["milkyWay"]["directionSummaryZh"],
        body["milkyWay"]["calculationNoteZh"],
    ]
    for day in body["moon"]["daily"]:
        values.extend(day["moonImpactReasonsZh"])
    for window in body["night"]["astronomicalNightWindows"]:
        values.append(window["noteZh"])
    for window in body["night"]["moonlessNightWindows"]:
        values.append(window["reasonZh"])
    for window in body["milkyWay"]["candidateWindows"]:
        values.append(window["directionZh"])
        values.append(window["noteZh"])
    for window in body["milkyWay"]["recommendedWindows"]:
        values.append(window["directionZh"])
        values.append(window["reasonZh"])
        values.extend(window["limitationsZh"])
    return values


def test_app_python_sources_are_utf8_and_not_mojibake() -> None:
    for path in APP_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        assert not any(marker in text for marker in MOJIBAKE_MARKERS), path


@pytest.mark.skipif(
    not Path(EPHEMERIS_PATH).exists(),
    reason="de421.bsp is required; run python apps/astro-service/scripts/fetch_ephemeris.py",
)
def test_calculate_response_returns_readable_utf8_chinese_fields() -> None:
    response = client.post(
        "/astro/calculate",
        json={
            "latitudeWgs84": 30.1321,
            "longitudeWgs84": 118.1691,
            "elevationMeters": 1800,
            "timezone": "Asia/Shanghai",
            "horizon": "72h",
            "targetDate": "2026-05-22",
        },
    )

    assert response.status_code == 200, response.text
    assert "charset=utf-8" in response.headers["content-type"].lower()
    decoded = response.content.decode("utf-8")
    assert "银心" in decoded
    assert "已叠加" in decoded

    body = response.json()
    assert any(
        direction in body["milkyWay"]["directionSummaryZh"]
        for direction in ("东南方", "南方", "西南方")
    )
    assert "银河" in body["milkyWay"]["calculationNoteZh"]
    assert "已叠加" in body["milkyWay"]["calculationNoteZh"]

    for value in collect_text_fields(body):
        assert_readable_chinese(value)
