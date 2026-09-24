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


_RECORD_LINE_RE = re.compile(r"^(?:\[[^\]]{1,120}\]\s*)?[^:\n]{1,60}:\s*\S")


def _best_line(text: str, terms: list[str], width: int) -> str | None:
    """Dòng bản ghi khớp nhiều từ khoá nhất, hoặc None nếu đây không phải bảng."""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    records = [ln for ln in lines if _RECORD_LINE_RE.match(ln)]
    if len(records) * 2 <= len(lines):
        return None

    wanted = {t.replace("_", " ") for t in terms if t}
    best, best_score = "", 0.0
    for line in records:
        low = normalize(line)
        score = sum(len(t) for t in wanted if t in low)
        if score > best_score:
            best_score, best = score, line
    if not best:
        return None
    # Bản ghi dài hơn cửa sổ vẫn trả nguyên dòng tới một mức: cắt ngang một bản
    # ghi sự cố là mất luôn phần cách xử lý.
    limit = width * 2
    return best if len(best) <= limit else best[:limit].rstrip() + "…"


def snippet(text: str, terms: list[str], width: int = 320) -> str:
    """Cắt đoạn trích quanh vùng tập trung nhiều từ khoá nhất.

    Bám vào lần khớp đầu tiên của từ khoá dài nhất là không đủ: một đoạn chỉ mục
    chứa nhiều bản ghi thì từ chung như "nguyên nhân" xuất hiện ngay đầu đoạn,
    còn bản ghi thật sự trả lời câu hỏi lại nằm ở giữa. Khi đó đoạn trích hiện
    ra không chứa câu trả lời dù truy hồi đã đúng.
    """
    if not text:
        return ""

    # Nội dung bảng đã kết xuất thành từng dòng trọn vẹn (một thông số, hoặc một
    # hiện tượng kèm nguyên nhân và cách xử lý). Với chúng, đơn vị có nghĩa là
    # cả dòng: cắt theo cửa sổ ký tự sẽ mất phần cuối, mà phần cuối lại chính là
    # giá trị cài đặt hoặc cách xử lý — thứ người đọc cần.
    line = _best_line(text, terms, width)
    if line is not None:
        return line

    haystack = normalize(text)

    matches: list[tuple[int, str]] = []
    for term in {t.replace("_", " ") for t in terms if t}:
        start = 0
        while len(matches) < 400:
            pos = haystack.find(term, start)
            if pos == -1:
                break
            matches.append((pos, term))
            start = pos + max(1, len(term))
    if not matches:
        return text[:width].strip() + ("…" if len(text) > width else "")

    matches.sort()
    best, best_score = matches[0][0], -1.0
    for pos, _ in matches:
        seen = {t for p, t in matches if pos <= p < pos + width}
        score = sum(len(t) for t in seen)
        if score > best_score:
            best_score, best = score, pos

    start = max(0, best - width // 6)
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
