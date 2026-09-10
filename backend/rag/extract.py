"""Trích xuất văn bản từ các định dạng tài liệu kỹ thuật thường gặp."""
from __future__ import annotations

import csv
import io
from pathlib import Path

from .textutils import clean_text


class ExtractionError(RuntimeError):
    pass


def extract(path: Path) -> list[tuple[int | None, str]]:
    """Trả về danh sách (số trang, nội dung). Trang là None nếu định dạng không phân trang."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _pdf(path)
    if suffix == ".docx":
        return _docx(path)
    if suffix == ".xlsx":
        return _xlsx(path)
    if suffix == ".csv":
        return _csv(path)
    if suffix in (".txt", ".md"):
        return [(None, clean_text(path.read_text(encoding="utf-8", errors="replace")))]
    raise ExtractionError(f"Chưa hỗ trợ định dạng {suffix}")


def _pdf(path: Path) -> list[tuple[int | None, str]]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[tuple[int | None, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = clean_text(page.extract_text() or "")
        except Exception:
            text = ""
        if text:
            pages.append((i, text))
    if not pages:
        raise ExtractionError(
            "Không đọc được nội dung văn bản trong PDF. "
            "Nhiều khả năng đây là bản scan ảnh, cần OCR trước khi nạp."
        )
    return pages


def _docx(path: Path) -> list[tuple[int | None, str]]:
    import docx

    doc = docx.Document(str(path))
    parts: list[str] = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "").lower()
        parts.append(f"\n## {text}\n" if style.startswith("heading") else text)
    for table in doc.tables:
        rows = []
        for row in table.rows:
            cells = [c.text.strip().replace("\n", " ") for c in row.cells]
            if any(cells):
                rows.append(" | ".join(cells))
        if rows:
            parts.append("\n" + "\n".join(rows))
    body = clean_text("\n".join(parts))
    if not body:
        raise ExtractionError("Tệp DOCX không có nội dung văn bản.")
    return [(None, body)]


def _xlsx(path: Path) -> list[tuple[int | None, str]]:
    from openpyxl import load_workbook

    wb = load_workbook(str(path), read_only=True, data_only=True)
    out: list[tuple[int | None, str]] = []
    for sheet in wb.worksheets:
        lines = [f"## Bảng: {sheet.title}"]
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if v is None else str(v).strip() for v in row]
            if any(cells):
                lines.append(" | ".join(cells))
        if len(lines) > 1:
            out.append((None, clean_text("\n".join(lines))))
    wb.close()
    if not out:
        raise ExtractionError("Bảng tính không có dữ liệu.")
    return out


def _csv(path: Path) -> list[tuple[int | None, str]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.reader(io.StringIO(raw))
    lines = [" | ".join(c.strip() for c in row) for row in reader if any(c.strip() for c in row)]
    if not lines:
        raise ExtractionError("Tệp CSV rỗng.")
    return [(None, clean_text("\n".join(lines)))]
