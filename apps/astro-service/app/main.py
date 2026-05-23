from __future__ import annotations

from functools import lru_cache
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .calculator import (
    EPHEMERIS_FILE_NAME,
    AstronomyCalculator,
    EphemerisMissingError,
)
from .models import AstroCalculateRequest, AstroCalculateResponse, HealthResponse
from .responses import Utf8JSONResponse
from .timezones import DEFAULT_TIMEZONE, get_timezone


APP_ROOT = Path(__file__).resolve().parents[1]
EPHEMERIS_PATH = APP_ROOT / "data" / EPHEMERIS_FILE_NAME
logger = logging.getLogger("astro-service")

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
                "请先按 README 下载 de421.bsp 后重试。"
            ),
        ) from error
