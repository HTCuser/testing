"""Phiếu thao tác lập từ mẫu Word: quản lý mẫu, cấp số tự động, điền và xuất phiếu."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel

from .. import config, docview, phieu
from ..db import get_conn, load_json, dump_json, query, query_one
from ..rag.textutils import normalize, strip_accents
from ..usage import _now

router = APIRouter(prefix="/api/phieu", tags=["Phiếu thao tác"])

CATEGORIES = {
    "van_hanh_co_lap": "Vận hành — Cô lập",
    "van_hanh_tai_lap": "Vận hành — Tái lập",
    "bao_duong_co_lap": "Bảo dưỡng, sửa chữa — Cô lập",
    "bao_duong_tai_lap": "Bảo dưỡng, sửa chữa — Tái lập",
    "khac": "Khác",
}
STATUSES = {"da_lap": "Đã lập", "da_thuc_hien": "Đã thực hiện", "huy": "Đã huỷ"}
DEFAULT_FORMAT = "###/YYYY/KH/HHC"
SAMPLE = Path(__file__).resolve().parent.parent / "mau" / "mau-phieu-thao-tac-vi-du.docx"

# Khoá chung cho ô ngày khi mẫu tách "ngày {{Ngày}} tháng {{Tháng}} năm {{Năm}}".
DATE_KEY = "_ngay"


# ---------------------------------------------------------------- tiện ích

def _dump_values(values: dict) -> str:
    # Không dùng dump_json chung: hàm đó đổi dict rỗng thành "[]".
    return json.dumps(values, ensure_ascii=False)


def _load_values(raw) -> dict:
    value = load_json(raw, {})
    return value if isinstance(value, dict) else {}


def _describe_fields(names: list[str]) -> list[dict]:
    return [{"name": n, "kind": phieu.field_kind(n, names)} for n in names]


def _template_or_404(template_id: int) -> dict:
    row = query_one("SELECT * FROM ticket_templates WHERE id = ?", (template_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy mẫu phiếu")
    item = dict(row)
    item["fields"] = _describe_fields(load_json(item["fields"], []))
    item["category_label"] = CATEGORIES.get(item["category"], item["category"])
    return item


def _ticket_or_404(ticket_id: int) -> dict:
    row = query_one(
        """SELECT t.*, m.name AS template_name, m.category AS template_category
             FROM tickets t JOIN ticket_templates m ON m.id = t.template_id
            WHERE t.id = ?""",
        (ticket_id,),
    )
    if row is None:
        raise HTTPException(404, "Không tìm thấy phiếu")
    item = dict(row)
    item["values"] = _load_values(item.pop("field_values"))
    item["status_label"] = STATUSES.get(item["status"], item["status"])
    return item


def _check_format(value: str) -> str:
    value = (value or "").strip() or DEFAULT_FORMAT
    if "#" not in value:
        raise HTTPException(400, 'Định dạng số phiếu phải có dấu "#" đánh dấu chỗ đặt số thứ tự, '
                                 'ví dụ ###/YYYY/KH/HHC')
    if len(value) > 60:
        raise HTTPException(400, "Định dạng số phiếu quá dài")
    return value


def _year() -> int:
    return _now().year


def _next_number(book: str, year: int) -> int:
    row = query_one("SELECT next_number FROM ticket_counters WHERE book = ? AND year = ?",
                    (book, year))
    if row:
        return row["next_number"]
    used = query_one("SELECT MAX(number) AS n FROM tickets WHERE book = ? AND year = ?",
                     (book, year))
    return (used["n"] or 0) + 1


def _resolve(fields: list[dict], raw: dict, code: str) -> dict[str, str]:
    """Giá trị điền vào mẫu, tính từ dữ liệu người dùng nhập."""
    parts = phieu.date_parts(raw.get(DATE_KEY, ""))
    out: dict[str, str] = {}
    for field in fields:
        name, kind = field["name"], field["kind"]
        value = str(raw.get(name, "") or "")
        if kind == "number":
            value = code
        elif kind in ("day", "month", "year"):
            value = parts.get(kind, "")
        elif kind == "date":
            value = phieu.date_parts(value).get("date", value)
        elif kind == "time" and re.fullmatch(r"\d{1,2}:\d{2}", value):
            hour, minute = value.split(":")
            value = f"{int(hour):02d}h{minute}"
        out[name] = value
    return out


def _ticket_date(fields: list[dict], raw: dict) -> str:
    if raw.get(DATE_KEY):
        return raw[DATE_KEY]
    for field in fields:
        if field["kind"] == "date" and raw.get(field["name"]):
            return raw[field["name"]]
    return _now().date().isoformat()


def _ticket_file(ticket_id: int) -> Path:
    return config.TICKET_DIR / f"phieu-{ticket_id}.docx"


def _render(ticket: dict, template: dict) -> None:
    """Dựng file Word của phiếu và lưu lại — đó là bản đã phát hành."""
    path = config.TICKET_TEMPLATE_DIR / template["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Tệp mẫu của phiếu này không còn trên máy chủ")
    values = _resolve(template["fields"], ticket["values"], ticket["code"])
    _ticket_file(ticket["id"]).write_bytes(phieu.fill(path, values))


def _safe_name(text: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "-", text).strip() or "phieu"


# ---------------------------------------------------------------- mẫu phiếu

@router.get("/mau")
def list_templates() -> dict:
    rows = query(
        """SELECT m.*, (SELECT COUNT(*) FROM tickets t WHERE t.template_id = m.id) AS n_tickets
             FROM ticket_templates m ORDER BY m.name"""
    )
    items = []
    for row in rows:
        item = dict(row)
        item["fields"] = _describe_fields(load_json(item["fields"], []))
        item["category_label"] = CATEGORIES.get(item["category"], item["category"])
        items.append(item)
    return {"items": items, "categories": [{"value": k, "label": v} for k, v in CATEGORIES.items()]}


@router.get("/mau-vi-du")
def sample_template():
    if not SAMPLE.exists():
        raise HTTPException(404, "Không có mẫu ví dụ")
    return FileResponse(SAMPLE, filename="Mau phieu thao tac vi du.docx")


@router.post("/mau")
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("khac"),
    number_format: str = Form(DEFAULT_FORMAT),
) -> dict:
    filename = file.filename or "mau.docx"
    if Path(filename).suffix.lower() != ".docx":
        raise HTTPException(400, "Mẫu phiếu phải là file Word .docx "
                                 "(file .doc đời cũ: mở bằng Word rồi Lưu thành .docx)")
    if category not in CATEGORIES:
        category = "khac"
    number_format = _check_format(number_format)

    stored = f"{uuid.uuid4().hex}.docx"
    path = config.TICKET_TEMPLATE_DIR / stored
    path.write_bytes(await file.read())
    try:
        fields = phieu.find_fields(path)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Không đọc được file Word: {exc}")
    if not fields:
        path.unlink(missing_ok=True)
        raise HTTPException(
            400,
            "Không tìm thấy ô cần điền nào trong mẫu. Mở mẫu bằng Word, gõ tên ô trong "
            "cặp ngoặc nhọn kép tại chỗ cần điền, ví dụ {{Số phiếu}}, {{Người viết phiếu}}, "
            "{{Ngày}}, rồi lưu và tải lên lại.",
        )

    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO ticket_templates (name, category, filename, stored_name, fields, number_format)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (name.strip() or Path(filename).stem, category, filename, stored,
         dump_json(fields), number_format),
    )
    conn.commit()
    return _template_or_404(cur.lastrowid)


class TemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    number_format: str | None = None


@router.get("/mau/{template_id}")
def get_template(template_id: int) -> dict:
    item = _template_or_404(template_id)
    year = _year()
    number = _next_number(item["number_format"], year)
    item["next"] = {
        "year": year,
        "number": number,
        "code": phieu.format_number(item["number_format"], number, year),
    }
    item["suggestions"] = _suggestions(item["fields"])
    return item


@router.put("/mau/{template_id}")
def update_template(template_id: int, payload: TemplateUpdate) -> dict:
    item = _template_or_404(template_id)
    name = (payload.name or item["name"]).strip() or item["name"]
    category = payload.category if payload.category in CATEGORIES else item["category"]
    number_format = item["number_format"]
    if payload.number_format is not None and payload.number_format.strip() != number_format:
        # Đổi định dạng là chuyển sang sổ khác; phiếu cũ giữ nguyên số đã cấp.
        number_format = _check_format(payload.number_format)
    conn = get_conn()
    conn.execute(
        """UPDATE ticket_templates SET name = ?, category = ?, number_format = ?,
                  updated_at = datetime('now') WHERE id = ?""",
        (name, category, number_format, template_id),
    )
    conn.commit()
    return get_template(template_id)


@router.delete("/mau/{template_id}", status_code=204)
def delete_template(template_id: int) -> Response:
    item = _template_or_404(template_id)
    used = query_one("SELECT COUNT(*) AS n FROM tickets WHERE template_id = ?", (template_id,))
    if used["n"]:
        raise HTTPException(
            409,
            f"Mẫu này đã dùng để lập {used['n']} phiếu. Phải giữ lại mẫu để các phiếu đó "
            "còn xuất lại được đúng như lúc lập.",
        )
    conn = get_conn()
    conn.execute("DELETE FROM ticket_templates WHERE id = ?", (template_id,))
    conn.commit()
    (config.TICKET_TEMPLATE_DIR / item["stored_name"]).unlink(missing_ok=True)
    return Response(status_code=204)


@router.get("/mau/{template_id}/file")
def download_template(template_id: int):
    item = _template_or_404(template_id)
    path = config.TICKET_TEMPLATE_DIR / item["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Tệp mẫu không còn trên máy chủ")
    return FileResponse(path, filename=item["filename"] or f"{_safe_name(item['name'])}.docx")


def _suggestions(fields: list[dict], limit: int = 15) -> dict[str, list[str]]:
    """Giá trị đã từng nhập cho từng ô, mới nhất trước, để chọn lại khỏi gõ."""
    wanted = {normalize(f["name"]): f["name"] for f in fields if f["kind"] in ("text", "multiline")}
    found: dict[str, list[str]] = {name: [] for name in wanted.values()}
    rows = query("SELECT field_values FROM tickets ORDER BY id DESC LIMIT 400")
    for row in rows:
        for key, value in _load_values(row["field_values"]).items():
            name = wanted.get(normalize(key))
            value = str(value or "").strip()
            if name and value and value not in found[name] and len(found[name]) < limit:
                found[name].append(value)
    return found


# ---------------------------------------------------------------- số phiếu

class CounterUpdate(BaseModel):
    template_id: int
    next_number: int


@router.put("/so-tiep-theo")
def set_next_number(payload: CounterUpdate) -> dict:
    """Đặt số tiếp theo, dùng khi nối tiếp dãy số đang ghi trên sổ giấy."""
    item = _template_or_404(payload.template_id)
    book, year = item["number_format"], _year()
    used = query_one("SELECT MAX(number) AS n FROM tickets WHERE book = ? AND year = ?",
                     (book, year))["n"] or 0
    if payload.next_number <= used:
        raise HTTPException(
            400, f"Năm {year} sổ này đã cấp tới số {used}, số tiếp theo phải lớn hơn {used}.")
    if payload.next_number > 99999:
        raise HTTPException(400, "Số phiếu quá lớn")
    conn = get_conn()
    conn.execute(
        """INSERT INTO ticket_counters (book, year, next_number) VALUES (?, ?, ?)
           ON CONFLICT(book, year) DO UPDATE SET next_number = excluded.next_number""",
        (book, year, payload.next_number),
    )
    conn.commit()
    return get_template(payload.template_id)


# ---------------------------------------------------------------- phiếu

class TicketIn(BaseModel):
    template_id: int
    values: dict[str, str] = {}


class TicketUpdate(BaseModel):
    values: dict[str, str] | None = None
    status: str | None = None
    note: str | None = None


@router.get("")
def list_tickets(q: str = "", status: str = "", template_id: int | None = None,
                 year: int | None = None) -> dict:
    sql = """SELECT t.*, m.name AS template_name FROM tickets t
               JOIN ticket_templates m ON m.id = t.template_id WHERE 1 = 1"""
    params: list = []
    if status:
        sql += " AND t.status = ?"
        params.append(status)
    if template_id:
        sql += " AND t.template_id = ?"
        params.append(template_id)
    if year:
        sql += " AND t.year = ?"
        params.append(year)
    sql += " ORDER BY t.year DESC, t.created_at DESC, t.id DESC"
    items = []
    needle = normalize(q.strip())
    for row in query(sql, params):
        item = dict(row)
        item["values"] = _load_values(item.pop("field_values"))
        item["status_label"] = STATUSES.get(item["status"], item["status"])
        if needle:
            hay = normalize(" ".join([item["code"], item["template_name"], item["note"],
                                      *map(str, item["values"].values())]))
            if needle not in hay:
                continue
        items.append(item)
    years = [r["year"] for r in query("SELECT DISTINCT year FROM tickets ORDER BY year DESC")]
    return {
        "items": items,
        "total": len(items),
        "years": years,
        "statuses": [{"value": k, "label": v} for k, v in STATUSES.items()],
    }


@router.post("")
def create_ticket(payload: TicketIn) -> dict:
    template = _template_or_404(payload.template_id)
    book, year = template["number_format"], _year()
    raw = {k: v for k, v in payload.values.items() if isinstance(v, str)}
    ticket_date = _ticket_date(template["fields"], raw)

    conn = get_conn()
    if conn.in_transaction:
        conn.commit()
    # Khoá ghi ngay từ đầu: hai người bấm lưu cùng lúc vẫn nhận hai số khác nhau.
    conn.execute("BEGIN IMMEDIATE")
    try:
        number = _next_number(book, year)
        code = phieu.format_number(book, number, year)
        cur = conn.execute(
            """INSERT INTO tickets (template_id, book, year, number, code, ticket_date, field_values)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (template["id"], book, year, number, code, ticket_date, _dump_values(raw)),
        )
        conn.execute(
            """INSERT INTO ticket_counters (book, year, next_number) VALUES (?, ?, ?)
               ON CONFLICT(book, year) DO UPDATE SET next_number = excluded.next_number""",
            (book, year, number + 1),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    ticket = _ticket_or_404(cur.lastrowid)
    _render(ticket, template)
    return ticket


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int) -> dict:
    ticket = _ticket_or_404(ticket_id)
    template = _template_or_404(ticket["template_id"])
    ticket["fields"] = template["fields"]
    ticket["suggestions"] = _suggestions(template["fields"])
    return ticket


@router.put("/{ticket_id}")
def update_ticket(ticket_id: int, payload: TicketUpdate) -> dict:
    ticket = _ticket_or_404(ticket_id)
    template = _template_or_404(ticket["template_id"])
    values = ticket["values"]
    if payload.values is not None:
        values = {k: v for k, v in payload.values.items() if isinstance(v, str)}
    status = payload.status if payload.status in STATUSES else ticket["status"]
    note = ticket["note"] if payload.note is None else payload.note.strip()
    conn = get_conn()
    conn.execute(
        """UPDATE tickets SET field_values = ?, ticket_date = ?, status = ?, note = ?,
                  updated_at = datetime('now') WHERE id = ?""",
        (_dump_values(values), _ticket_date(template["fields"], values), status, note, ticket_id),
    )
    conn.commit()
    ticket = _ticket_or_404(ticket_id)
    _render(ticket, template)
    return get_ticket(ticket_id)


def _ticket_path(ticket_id: int) -> tuple[dict, Path]:
    ticket = _ticket_or_404(ticket_id)
    path = _ticket_file(ticket_id)
    if not path.exists():
        _render(ticket, _template_or_404(ticket["template_id"]))
    return ticket, path


@router.get("/{ticket_id}/word")
def download_ticket(ticket_id: int):
    ticket, path = _ticket_path(ticket_id)
    # Tên file không dấu: có trình duyệt/máy in mạng ở nhà máy đọc sai tên có
    # dấu, và file Word mở ra vẫn đủ tiếng Việt bên trong.
    name = strip_accents(_safe_name(f"PTT {ticket['code']} - {ticket['template_name']}")) + ".docx"
    return FileResponse(
        path,
        filename=name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{ticket_id}/xem", response_class=HTMLResponse)
def view_ticket(ticket_id: int):
    ticket, path = _ticket_path(ticket_id)
    try:
        body = docview.render_body_cached(path)
    except Exception as exc:
        raise HTTPException(422, f"Không dựng được bản xem: {exc}")
    meta = f"{ticket['template_name']} · {ticket['status_label']}"
    if ticket["status"] == "huy":
        body = ('<p style="color:#b91c1c;font-weight:700;border:2px solid #b91c1c;'
                'padding:8px 12px;display:inline-block">PHIẾU ĐÃ HUỶ</p>' + body)
    return HTMLResponse(docview.page(
        f"Phiếu thao tác số {ticket['code']}", meta, body, f"/api/phieu/{ticket_id}/word"))
