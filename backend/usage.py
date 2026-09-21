"""Hạn mức gọi mô hình sinh câu trả lời.

Đếm theo ngày và theo tháng, mốc đổi kỳ tính theo giờ nhà máy. Hết hạn mức thì
tra cứu vẫn chạy bình thường, chỉ chuyển sang chế độ trích lược — chặn hẳn sẽ
làm vận hành viên mất công cụ tra cứu đúng lúc cần nhất.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import config
from .db import execute, query_one

DAY = "ngay"
MONTH = "thang"


def _now() -> datetime:
    return datetime.now(timezone(timedelta(hours=config.TIMEZONE_OFFSET_HOURS)))


def _period_keys() -> tuple[str, str]:
    now = _now()
    return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")


def _used(kind: str, key: str) -> int:
    row = query_one(
        "SELECT used FROM ask_usage WHERE period_kind = ? AND period_key = ?",
        (kind, key),
    )
    return row["used"] if row else 0


def status() -> dict:
    day_key, month_key = _period_keys()
    day_used = _used(DAY, day_key)
    month_used = _used(MONTH, month_key)
    return {
        "day": {
            "used": day_used,
            "limit": config.DAILY_ASK_LIMIT,
            "remaining": max(0, config.DAILY_ASK_LIMIT - day_used),
            "key": day_key,
        },
        "month": {
            "used": month_used,
            "limit": config.MONTHLY_ASK_LIMIT,
            "remaining": max(0, config.MONTHLY_ASK_LIMIT - month_used),
            "key": month_key,
        },
    }


def check() -> tuple[bool, str]:
    """(còn hạn mức không, lý do nếu hết)."""
    state = status()
    if state["month"]["remaining"] <= 0:
        return False, (
            f"Đã dùng hết hạn mức tháng ({state['month']['limit']} lượt). "
            "Hạn mức mở lại vào đầu tháng sau."
        )
    if state["day"]["remaining"] <= 0:
        return False, (
            f"Đã dùng hết hạn mức ngày ({state['day']['limit']} lượt). "
            "Hạn mức mở lại vào 0 giờ ngày mai."
        )
    return True, ""


def record() -> None:
    """Ghi nhận một lượt đã gọi mô hình sinh."""
    day_key, month_key = _period_keys()
    for kind, key in ((DAY, day_key), (MONTH, month_key)):
        execute(
            """INSERT INTO ask_usage (period_kind, period_key, used) VALUES (?, ?, 1)
               ON CONFLICT(period_kind, period_key) DO UPDATE SET used = used + 1""",
            (kind, key),
        )
