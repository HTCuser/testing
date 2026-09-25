"""Bảng đối chiếu mã chức năng bảo vệ ↔ tên gọi, tự học từ chính thư viện.

Quy trình ghi mã theo ANSI ("87T", "87TN", "96B") kèm tên tiếng Việt, nhưng mỗi
nơi gọi một kiểu: "Bảo vệ so lệch (87T)", "Bảo vệ so lệch dọc MBA (87T)",
"87T (Bảo vệ so lệch MBA)". Người hỏi lại dùng cách gọi của mình ("so lệch
MBA"). Tìm theo từ khoá thì câu hỏi đó khớp đúng tên của 87TN ("so lệch chống
chạm đất hạn chế MBA") hơn là 87T — trả lời lạc sang chức năng khác.

Bảng này gom mọi cặp "tên (mã)" và "mã (tên)" có trong tài liệu, rồi dùng nó
theo hai chiều: đoạn nào nhắc mã thì được lập chỉ mục kèm mọi tên gọi của mã
đó; câu hỏi nào nêu một tên gọi thì được bổ sung mã tương ứng.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .textutils import normalize, syllables

_CODE = r"\d{2}[a-z]{1,3}\d?"
_NAME = r"bao ve[^()\[\];:,.\n]{2,60}?"
_PAIRS = (
    re.compile(rf"({_NAME})\s*\(({_CODE})\)"),                 # tên (mã)
    re.compile(rf"(?<![\w/])({_CODE})\s*\(({_NAME}[^()\n]*?)\)"),  # mã (tên)
)
_LEAD = "bao ve "


def build(texts) -> dict[str, set[str]]:
    """Mã (đã chuẩn hoá) → các tên gọi (đã chuẩn hoá, bỏ chữ "bảo vệ")."""
    table: dict[str, set[str]] = defaultdict(set)
    for text in texts:
        low = normalize(text)
        for pattern in _PAIRS:
            for a, b in pattern.findall(low):
                name, code = (a, b) if pattern is _PAIRS[0] else (b, a)
                core = " ".join(syllables(name))
                if core.startswith(_LEAD):
                    core = core[len(_LEAD):]
                # Tên một hai âm tiết ("so lệch") dùng chung cho nhiều chức năng,
                # đối chiếu theo nó chỉ gây nhiễu.
                if len(core.split()) >= 3:
                    table[code].add(core)
    return dict(table)


def expand_document(text: str, table: dict[str, set[str]]) -> str:
    """Các tên gọi cần lập chỉ mục thêm cho một đoạn, theo các mã nó nhắc tới."""
    if not table:
        return ""
    present = set(syllables(text))
    names = [name for code in table if code in present for name in table[code]]
    return " ".join(sorted(set(names)))


def expand_query(question: str, table: dict[str, set[str]]) -> list[str]:
    """Các mã cần bổ sung vào câu hỏi, theo tên gọi người hỏi dùng.

    Chấp nhận thiếu một âm tiết ở giữa tên: người hỏi nói "so lệch MBA" trong
    khi tài liệu ghi "so lệch dọc MBA" — cùng một chức năng.
    """
    if not table:
        return []
    words = syllables(question)
    joined = f" {' '.join(words)} "
    codes = []
    for code, names in table.items():
        if code in words:
            continue
        for name in names:
            parts = name.split()
            variants = [parts]
            if len(parts) >= 4:
                variants += [parts[:i] + parts[i + 1:] for i in range(1, len(parts) - 1)]
            if any(f" {' '.join(v)} " in joined for v in variants):
                codes.append(code)
                break
    return codes
