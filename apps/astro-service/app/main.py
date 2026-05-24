from __future__ import annotations

from functools import lru_cache
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .calculator import (
    EPHEMERIS_FILE_NAME,
    AstronomyCalculator,
    EphemerisLoadError,
    EphemerisMissingError,
)
from .models import AstroCalculateRequest, AstroCalculateResponse, HealthResponse
from .responses import Utf8JSONResponse
from .timezones import DEFAULT_TIMEZONE, get_timezone


DEFAULT_EPHEMERIS_PATH_TEXT = f"/app/data/{EPHEMERIS_FILE_NAME}"
DEFAULT_EPHEMERIS_PATH = Path(DEFAULT_EPHEMERIS_PATH_TEXT)
logger = logging.getLogger("astro-service")


def resolve_ephemeris_path() -> Path:
    configured_path = os.environ.get("EPHEMERIS_PATH", "").strip()
    if not configured_path:
        return DEFAULT_EPHEMERIS_PATH

    path = Path(configured_path)
    if not path.is_absolute():
        logger.warning("Ignoring relative EPHEMERIS_PATH; using default absolute path")
        return DEFAULT_EPHEMERIS_PATH

    return path


EPHEMERIS_PATH = resolve_ephemeris_path()


def format_ephemeris_path(path: Path) -> str:
    if path == DEFAULT_EPHEMERIS_PATH:
        return DEFAULT_EPHEMERIS_PATH_TEXT
    return str(path)

app = FastAPI(
    title="逐光天气本地天文计算服务",
    version="0.1.0",
    default_response_class=Utf8JSONResponse,
)


@lru_cache(maxsize=1)
def get_calculator() -> AstronomyCalculator:
    return AstronomyCalculator(EPHEMERIS_PATH)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    ephemeris_available = EPHEMERIS_PATH.exists()
    timezone_available = True
    try:
        get_timezone(DEFAULT_TIMEZONE)
    except HTTPException:
        timezone_available = False
    return HealthResponse(
        ok=ephemeris_available and timezone_available,
        service="astro-service",
        ephemerisAvailable=ephemeris_available,
        ephemerisFileName=EPHEMERIS_FILE_NAME,
        ephemerisPath=format_ephemeris_path(EPHEMERIS_PATH),
        timezoneAvailable=timezone_available,
        defaultTimezone=DEFAULT_TIMEZONE,
    )


@app.post("/astro/calculate", response_model=AstroCalculateResponse)
def calculate(request: AstroCalculateRequest) -> AstroCalculateResponse:
    try:
        get_timezone(request.timezone or DEFAULT_TIMEZONE)
        response = get_calculator().calculate(request)
        logger.info(
            "astro calculation completed",
            extra={
                "computeElapsedMs": response.calculationBasis.computeElapsedMs,
                "horizon": request.horizon,
                "targetDates": len(response.targetDates),
            },
        )
        return response
    except EphemerisMissingError as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "本地星历文件缺失，无法生成精确的星空银河窗口。"
                "请执行 bash scripts/download-ephemeris.sh 后重试。"
            ),
        ) from error
    except EphemerisLoadError as error:
        raise HTTPException(
            status_code=503,
            detail="本地星历文件无法读取，请检查文件完整性和权限。",
        ) from error
