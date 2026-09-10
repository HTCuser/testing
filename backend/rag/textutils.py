"""Chuẩn hoá và tách từ tiếng Việt phục vụ tìm kiếm từ khoá."""
from __future__ import annotations

import re
import unicodedata

# Hư từ tiếng Việt + tiếng Anh, loại bỏ để giảm nhiễu khi chấm điểm BM25.
STOPWORDS = {
    "va", "cua", "co", "la", "cho", "khi", "voi", "trong", "cac", "nhung", "duoc",
    "de", "den", "tu", "tai", "theo", "mot", "nay", "do", "ra", "vao", "nhu", "ma",
    "thi", "se", "da", "bi", "hoac", "neu", "vi", "nen", "cung", "con", "ve", "boi",
    "the", "a", "an", "of", "to", "in", "is", "are", "for", "on", "and", "or", "at",
    "it", "be", "by", "as", "that", "this", "with", "from",
}

_TOKEN_RE = re.compile(r"[0-9a-zA-ZÀ-ỹ]+", re.UNICODE)
_WS_RE = re.compile(r"[ \t ]+")
_MULTI_NL_RE = re.compile(r"\n{3,}")


def strip_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu."""
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def normalize(text: str) -> str:
    return strip_accents(unicodedata.normalize("NFC", text or "")).lower()


def clean_text(text: str) -> str:
    """Dọn khoảng trắng thừa nhưng giữ nguyên cấu trúc dòng."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(_WS_RE.sub(" ", line).strip() for line in text.split("\n"))
    return _MULTI_NL_RE.sub("\n\n", text).strip()


def syllables(text: str) -> list[str]:
    return _TOKEN_RE.findall(normalize(text))


def tokenize(text: str) -> list[str]:
    """Sinh unigram + bigram.

    Từ tiếng Việt thường gồm nhiều âm tiết ("máy phát", "kích từ"), nên chỉ dùng
    unigram sẽ mất ngữ nghĩa. Bigram bù lại phần lớn khoảng trống đó mà không cần
    bộ tách từ nặng nề.
    """
    syls = syllables(text)
    tokens = [s for s in syls if s.isdigit() or (len(s) > 1 and s not in STOPWORDS)]
    bigrams = [f"{a}_{b}" for a, b in zip(syls, syls[1:])]
    return tokens + bigrams


def snippet(text: str, terms: list[str], width: int = 320) -> str:
    """Cắt đoạn trích quanh vị trí khớp từ khoá đầu tiên."""
    if not text:
        return ""
    haystack = normalize(text)
    best = -1
    for term in sorted(terms, key=len, reverse=True):
        pos = haystack.find(term.replace("_", " "))
        if pos != -1:
            best = pos
            break
    if best == -1:
        return text[:width].strip() + ("…" if len(text) > width else "")
    start = max(0, best - width // 3)
    end = min(len(text), start + width)
    # Lùi/tiến tới ranh giới từ để đoạn trích không bị cắt giữa chừng một chữ.
    if start > 0:
        space = text.rfind(" ", 0, start)
        start = space + 1 if space != -1 else start
    if end < len(text):
        space = text.find(" ", end)
        end = space if space != -1 else end
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix
