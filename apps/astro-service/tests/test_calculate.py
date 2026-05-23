from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import EPHEMERIS_PATH, app
from app.timezones import INVALID_TIMEZONE_MESSAGE, get_timezone


client = TestClient(app)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def calculate(payload: dict):
    response = client.post("/astro/calculate", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def window_contains(outer: dict, inner: dict) -> bool:
    return parse_time(outer["start"]) <= parse_time(inner["start"]) and parse_time(inner["end"]) <= parse_time(
        outer["end"]
    )


def test_default_timezone_loads_successfully() -> None:
    timezone = get_timezone("Asia/Shanghai")

    assert timezone.key == "Asia/Shanghai"


def test_invalid_timezone_returns_controlled_error() -> None:
    response = client.post(
        "/astro/calculate",
        json={
            "latitudeWgs84": 30.1321,
            "longitudeWgs84": 118.1691,
            "timezone": "Invalid/Timezone",
            "horizon": "24h",
            "targetDate": "2026-05-22",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == INVALID_TIMEZONE_MESSAGE


def test_calculate_invalid_timezone_does_not_expose_zoneinfo_error() -> None:
    response = client.post(
        "/astro/calculate",
        json={
            "latitudeWgs84": 30.1321,
            "longitudeWgs84": 118.1691,
            "timezone": "Mars/Base",
            "horizon": "24h",
            "targetDate": "2026-05-22",
        },
    )

    assert response.status_code == 400
    assert "ZoneInfoNotFoundError" not in response.text


@pytest.mark.skipif(
    not Path(EPHEMERIS_PATH).exists(),
    reason="de421.bsp is required; run python apps/astro-service/scripts/fetch_ephemeris.py",
)
class TestAstroCalculate:
    def test_calculate_endpoint_returns_required_structures(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "48h",
                "targetDate": "2026-05-22",
            }
        )

        assert body["forecastStart"].startswith("2026-05-22")
        assert body["sun"]["daily"]
        assert body["moon"]["daily"]
        assert body["moon"]["altitudeByHour"]
        assert body["night"]["astronomicalNightWindows"]
        assert "candidateWindows" in body["milkyWay"]
        assert "recommendedWindows" in body["milkyWay"]
        assert body["calculationBasis"]["ephemerisFileName"] == "de421.bsp"
        assert body["calculationBasis"]["coordinateSystem"] == "WGS84"
        assert body["calculationBasis"]["computeElapsedMs"] >= 0
        assert body["calculationBasis"]["samplingResolutionMinutes"]["galacticCenter"] == 10
        assert body["calculationBasis"]["samplingResolutionMinutes"]["moonAltitude"] == 60

    def test_moon_illumination_is_between_zero_and_one(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "24h",
                "targetDate": "2026-05-22",
            }
        )

        for day in body["moon"]["daily"]:
            assert 0 <= day["moonIllumination"] <= 1

    def test_twenty_four_hour_request_completes(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "24h",
                "targetDate": "2026-05-22",
            }
        )

        assert len(body["targetDates"]) >= 1
        assert body["calculationBasis"]["computeElapsedMs"] < 45000

    def test_astronomical_night_windows_are_ordered(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "72h",
                "targetDate": "2026-05-22",
            }
        )

        for window in body["night"]["astronomicalNightWindows"]:
            assert parse_time(window["start"]) < parse_time(window["end"])
            assert window["durationMinutes"] > 0

    def test_moonless_and_recommended_windows_respect_moonset(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "48h",
                "targetDate": "2026-05-22",
            }
        )
        moon_by_date = {day["date"]: day for day in body["moon"]["daily"]}

        for night in body["night"]["astronomicalNightWindows"]:
            moon = moon_by_date[night["date"]]
            moonset = moon.get("moonset")
            if not moonset or moon["moonImpactLevel"] == "low":
                continue
            moonset_time = parse_time(moonset)
            if not parse_time(night["start"]) <= moonset_time <= parse_time(night["end"]):
                continue
            for window in body["night"]["moonlessNightWindows"]:
                if window["date"] == night["date"]:
                    assert parse_time(window["start"]) >= moonset_time
            for window in body["milkyWay"]["recommendedWindows"]:
                if window["date"] == night["date"]:
                    assert parse_time(window["start"]) >= moonset_time

    def test_recommended_milky_way_windows_are_within_astronomical_night(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "72h",
                "targetDate": "2026-05-22",
            }
        )
        nights = {window["date"]: window for window in body["night"]["astronomicalNightWindows"]}

        for window in body["milkyWay"]["recommendedWindows"]:
            assert window["date"] in nights
            assert window_contains(nights[window["date"]], window)
            assert window["moonImpactLevel"] in {"low", "medium"}

    def test_seven_day_request_returns_multiple_nights_and_no_fixed_january_dates(self) -> None:
        body = calculate(
            {
                "latitudeWgs84": 30.1321,
                "longitudeWgs84": 118.1691,
                "elevationMeters": 1800,
                "timezone": "Asia/Shanghai",
                "horizon": "7d",
                "targetDate": "2026-05-22",
            }
        )

        assert len(body["targetDates"]) >= 7
        assert len(body["night"]["astronomicalNightWindows"]) >= 6
        assert body["calculationBasis"]["computeElapsedMs"] < 45000
        serialized = str(body)
        assert "2026-01-01" not in serialized
        assert "1970-01-01" not in serialized


def test_health_endpoint_reports_ephemeris_state() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "astro-service"
    assert response.json()["ephemerisFileName"] == "de421.bsp"
    assert response.json()["timezoneAvailable"] is True
    assert response.json()["defaultTimezone"] == "Asia/Shanghai"
