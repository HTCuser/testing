"""Trích xuất văn bản từ các định dạng tài liệu kỹ thuật thường gặp."""
from __future__ import annotations

import csv
import io
import re
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
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = docx.Document(str(path))
    parts: list[str] = []
    # Duyệt xen kẽ đoạn văn và bảng theo đúng thứ tự trong file. Đọc hết đoạn
    # văn rồi mới đọc bảng sẽ khiến bảng thông số mất liên hệ với tiêu đề mục
    # của nó, và khi truy hồi ra một dòng bảng thì không còn biết nó thuộc mục nào.
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            para = Paragraph(child, doc)
            text = para.text.strip()
            if not text:
                continue
            style = (para.style.name or "").lower()
            parts.append(f"\n## {text}\n" if style.startswith("heading") else text)
        elif tag == "tbl":
            rows = _render_table(Table(child, doc))
            if rows:
                parts.append("\n" + "\n".join(rows) + "\n")

    body = clean_text("\n".join(parts))
    if not body:
        raise ExtractionError("Tệp DOCX không có nội dung văn bản.")
    return [(None, body)]


def _row_cells(row) -> list[tuple[str, bool]]:
    """(nội dung ô, có phải phần kéo dài của ô gộp bên trái không).

    Ô gộp được python-docx trả về lặp lại nguyên văn, phải bỏ bớt. Nhưng so
    theo nội dung thì sai: trong ma trận cắt, hai cột máy cắt cạnh nhau cùng
    đánh dấu "X" là hai máy cắt khác nhau chứ không phải một ô gộp — bỏ đi là
    mất thông tin bảo vệ nào cắt máy cắt nào. Ô gộp thật dùng chung một phần tử
    XML nên so theo phần tử mới đúng.
    """
    cells: list[tuple[str, bool]] = []
    previous = None
    for cell in row.cells:
        cells.append((cell.text.strip().replace("\n", " "), cell._tc is previous))
        previous = cell._tc
    return cells


def _row_values(row) -> list[str]:
    return [text for text, _ in _row_cells(row)]


# Dòng dạng "Hiện tượng: ..." — có nhãn ngắn rồi mới tới nội dung.
_LABELLED_RE = re.compile(r"^[^:\n]{1,30}:\s+\S")

# Bảng thủ tục ở đầu quy trình: trang ký duyệt và danh sách phân phối. Chúng
# không bao giờ trả lời được câu hỏi kỹ thuật nhưng lại giàu từ chung nên hay
# chen vào kết quả tra cứu.
_ADMIN_LABELS = {
    "chữ ký", "họ và tên", "họ tên", "chức vụ", "số bản", "nơi nhận",
    "ngày ký", "người phê duyệt", "người soạn thảo", "người kiểm tra",
    "tên đơn vị/bộ phận", "đơn vị nhận",
}


def _is_admin_table(header: list[str], rows: list[list[str]]) -> bool:
    labels = {h.strip().lower() for h in header if h.strip()}
    if labels and len(labels & _ADMIN_LABELS) * 2 >= len(labels):
        return True
    # Trang ký duyệt hay không có tiêu đề cột, nhãn nằm ngay trong ô.
    flat = {v.strip().lower().rstrip(":") for row in rows[:6] for v in row if v.strip()}
    return len(flat & _ADMIN_LABELS) >= 3


def _is_number(value: str) -> bool:
    return bool(value) and all(c.isdigit() or c in ",.-" for c in value)


def _header_of(cells: list[list[tuple[str, bool]]]) -> tuple[list[str], int]:
    """Tách tiêu đề cột, gộp lại nếu tiêu đề trải hai tầng.

    Quy trình kỹ thuật hay dùng tiêu đề hai tầng: tầng trên gộp ngang ("Các bảo
    vệ của hệ thống"), tầng dưới chia nhỏ ("Tiếng Anh", "Tiếng Việt"). Lấy mỗi
    tầng trên làm tên cột sẽ gán nhầm nhãn cho toàn bộ dữ liệu bên dưới.
    """
    top = [text for text, _ in cells[0]]
    rows = [[text for text, _ in row] for row in cells]
    if len(rows) < 2:
        return top, 1
    sub = rows[1]
    merged_top = any(merged for _, merged in cells[0])
    filled = [v for v in sub if v]
    looks_like_labels = (
        bool(filled)
        and all(len(v) <= 40 for v in filled)
        and sum(_is_number(v) for v in filled) * 2 <= len(filled)
        and any(sub[i] != top[i] for i in range(min(len(sub), len(top))))
    )
    if not (merged_top and looks_like_labels):
        return top, 1

    combined = []
    for i in range(len(top)):
        t, s = top[i], sub[i] if i < len(sub) else ""
        combined.append(f"{t} - {s}" if s and t and s != t else (s or t))
    return combined, 2


def _render_table(table) -> list[str]:
    """Kết xuất mỗi dòng bảng thành một bản ghi tự mô tả.

    Bảng trong quy trình kỹ thuật là nơi chứa thông số và cách xử lý sự cố. Nếu
    chỉ nối các ô bằng dấu "|" thì khi truy hồi ra một dòng giữa bảng, người đọc
    chỉ thấy "12,5 | m" mà không biết đó là thông số gì — dòng tiêu đề cột nằm ở
    đoạn chỉ mục khác. Ghép sẵn tên cột vào từng ô để mỗi dòng đứng một mình vẫn
    đọc được và tìm được.
    """
    cells = [_row_cells(r) for r in table.rows]
    cells = [c for c in cells if any(text for text, _ in c)]
    if not cells:
        return []

    # Hàng đầu chỉ có một nội dung trải hết chiều ngang thì đó là tiêu đề nhóm
    # chứ không phải tiêu đề cột.
    if len({text for text, _ in cells[0] if text}) < 2:
        header, skip = [], 0
    else:
        header, skip = _header_of(cells)
    body = cells[skip:]

    if _is_admin_table(header, [[t for t, _ in row] for row in body]):
        return []

    out: list[str] = []
    group = ""
    context = ""
    pending = ""  # mô tả chung chưa được gộp vào bản ghi nào

    def flush_pending() -> None:
        nonlocal pending
        if pending:
            out.append(f"[{group}] {pending}" if group else pending)
            pending = ""

    for row in body:
        values = [text for text, _ in row]
        distinct = [v for v in dict.fromkeys(values) if v]
        if len(distinct) == 1:
            only = distinct[0].strip()
            flush_pending()
            # Bảng xử lý sự cố hay có ba tầng: tên sự cố, rồi một dòng trải hết
            # chiều ngang dạng "Hiện tượng: ...", rồi các cặp nguyên nhân - xử
            # lý. Dòng "Nhãn: nội dung" là mô tả của nhóm đang mở, coi nó là
            # nhóm mới sẽ đẩy cả đoạn văn dài đó lên làm tiêu đề cho các dòng sau.
            if group and _LABELLED_RE.match(only):
                context = pending = only
            else:
                group, context = only.rstrip(":"), ""
                out.append(f"— {group}")
            continue

        fields: list[str] = []
        for i, (value, merged) in enumerate(row):
            if not value or merged:
                continue
            label = header[i].strip() if i < len(header) else ""
            if label and label.lower() not in ("stt", "tt"):
                fields.append(f"{label}: {value}")
            elif not label:
                fields.append(value)
        if not fields:
            continue
        # Ghép cả tên nhóm lẫn mô tả chung vào từng dòng để mỗi bản ghi đứng một
        # mình vẫn đủ nghĩa: đọc ra một nguyên nhân mà không biết nó thuộc sự cố
        # nào, hiện tượng ra sao thì không xử lý được.
        pending = ""  # mô tả đã được gộp vào bản ghi này
        line = f"{context}; {'; '.join(fields)}" if context else "; ".join(fields)
        out.append(f"[{group}] {line}" if group else line)
    flush_pending()
    return out


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
