from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException


DEFAULT_TIMEZONE = "Asia/Shanghai"
INVALID_TIMEZONE_MESSAGE = "无效或不可用的时区，请使用 Asia/Shanghai 等 IANA 时区名称。"


def get_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail=INVALID_TIMEZONE_MESSAGE) from error
