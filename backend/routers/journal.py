"""Nhật ký nghiệp vụ: thao tác vận hành và bảo dưỡng, sửa chữa do VHV ghi lại.

Mỗi bản ghi được lập chỉ mục như một tài liệu, nên trợ lý kỹ thuật tra cứu
được: "lần trước đưa MBA T2 vào làm việc có vướng gì không", "lần thay gioăng
van cầu gần nhất dùng vật tư gì".
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import execute, query, query_one, row_to_dict, rows_to_dicts
from ..models import JournalIn
from ..rag.indexer import JOURNAL_LABELS, index_record, remove_record, render_journal
from ..rag.textutils import normalize

router = APIRouter(prefix="/api/nhat-ky", tags=["Nhật ký nghiệp vụ"])

KINDS = tuple(JOURNAL_LABELS)
SOURCE_KIND = {"thao_tac": "nhat_ky_thao_tac", "bao_duong": "nhat_ky_bao_duong"}
FIELDS = ("title", "started_at", "finished_at", "shift", "equipment_id", "ref", "performers",
          "leader", "details", "materials", "result", "notes", "tags")

_SELECT = """SELECT j.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
               FROM journal j LEFT JOIN equipment e ON e.id = j.equipment_id"""


def _check_kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(400, "Loại nhật ký không hợp lệ")
    return kind


def _get(entry_id: int) -> dict:
    row = query_one(f"{_SELECT} WHERE j.id = ?", (entry_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    return row_to_dict(row)


@router.get("/nhan")
def labels() -> dict:
    return JOURNAL_LABELS


@router.get("")
def list_entries(kind: str, q: str = "", equipment_id: int | None = None,
                 tu_ngay: str = "", den_ngay: str = "") -> dict:
    _check_kind(kind)
    sql = f"{_SELECT} WHERE j.kind = ?"
    params: list = [kind]
    if equipment_id:
        sql += " AND j.equipment_id = ?"
        params.append(equipment_id)
    if tu_ngay:
        sql += " AND substr(j.started_at, 1, 10) >= ?"
        params.append(tu_ngay)
    if den_ngay:
        sql += " AND substr(j.started_at, 1, 10) <= ?"
        params.append(den_ngay)
    sql += " ORDER BY j.started_at DESC, j.id DESC"
    items = rows_to_dicts(query(sql, params))
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(" ".join(str(it.get(f) or "") for f in FIELDS + ("equipment_name",)))
        ]
    return {"items": items, "total": len(items)}


@router.get("/goi-y")
def suggestions(kind: str) -> dict:
    """Giá trị đã từng nhập, để chọn lại khỏi gõ: ca kíp, người, số phiếu."""
    _check_kind(kind)
    out: dict[str, list[str]] = {}
    for field in ("shift", "performers", "leader"):
        rows = query(
            f"""SELECT {field} AS v, MAX(id) AS last FROM journal
                 WHERE kind = ? AND {field} <> '' GROUP BY {field} ORDER BY last DESC LIMIT 15""",
            (kind,),
        )
        out[field] = [r["v"] for r in rows]
    if kind == "thao_tac":
        # Số phiếu thao tác lập gần đây, để gắn nhật ký với phiếu đã thực hiện.
        rows = query("SELECT code FROM tickets WHERE status <> 'huy' ORDER BY id DESC LIMIT 30")
        out["ref"] = [r["code"] for r in rows]
    else:
        out["ref"] = [r["ref"] for r in query(
            "SELECT DISTINCT ref FROM journal WHERE kind = 'bao_duong' AND ref <> '' "
            "ORDER BY id DESC LIMIT 15")]
    return out


@router.get("/{entry_id}")
def get_entry(entry_id: int) -> dict:
    entry = _get(entry_id)
    if entry["kind"] == "thao_tac" and entry["ref"]:
        ticket = query_one("SELECT id FROM tickets WHERE code = ?", (entry["ref"].strip(),))
        entry["ticket_id"] = ticket["id"] if ticket else None
    return entry


@router.post("", status_code=201)
def create_entry(kind: str, payload: JournalIn) -> dict:
    _check_kind(kind)
    data = payload.model_dump()
    new_id = execute(
        f"INSERT INTO journal (kind, {', '.join(FIELDS)}) VALUES (?, {', '.join('?' * len(FIELDS))})",
        (kind, *[data[f] for f in FIELDS]),
    )
    _reindex(new_id)
    return get_entry(new_id)


@router.put("/{entry_id}")
def update_entry(entry_id: int, payload: JournalIn) -> dict:
    _get(entry_id)
    data = payload.model_dump()
    execute(
        f"UPDATE journal SET {', '.join(f'{f} = ?' for f in FIELDS)}, updated_at = datetime('now') "
        "WHERE id = ?",
        (*[data[f] for f in FIELDS], entry_id),
    )
    _reindex(entry_id)
    return get_entry(entry_id)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: int) -> None:
    entry = _get(entry_id)
    execute("DELETE FROM journal WHERE id = ?", (entry_id,))
    remove_record(SOURCE_KIND[entry["kind"]], entry_id)


def _reindex(entry_id: int) -> None:
    entry = _get(entry_id)
    index_record(
        SOURCE_KIND[entry["kind"]],
        entry_id,
        title=f"{JOURNAL_LABELS[entry['kind']]['_name']}: {entry['title']}",
        category="nhat_ky",
        equipment_id=entry["equipment_id"],
        text=render_journal(entry, entry["equipment_name"]),
    )
