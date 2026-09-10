from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import dump_json, execute, query, query_one, row_to_dict, rows_to_dicts
from ..models import FormIn
from ..rag.indexer import FORM_LABELS, index_record, remove_record, render_form
from ..rag.textutils import normalize

router = APIRouter(prefix="/api/forms", tags=["Biểu mẫu"])

JSON_FIELDS = ("safety", "rows")


@router.get("/types")
def form_types() -> dict:
    return {"items": [{"value": k, "label": v} for k, v in FORM_LABELS.items()]}


@router.get("")
def list_forms(q: str = "", form_type: str = "", equipment_id: int | None = None) -> dict:
    rows = query(
        """SELECT f.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM forms f LEFT JOIN equipment e ON e.id = f.equipment_id
            ORDER BY f.form_type, f.code, f.title"""
    )
    items = rows_to_dicts(rows, JSON_FIELDS)
    if form_type:
        items = [it for it in items if it["form_type"] == form_type]
    if equipment_id:
        items = [it for it in items if it["equipment_id"] == equipment_id]
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(
                f"{it['code']} {it['title']} {it['work_type']} {it['equipment_name']} {it['purpose']}"
            )
        ]
    for item in items:
        item["form_type_label"] = FORM_LABELS.get(item["form_type"], item["form_type"])
        item["n_rows"] = len(item["rows"])
    return {"items": items, "total": len(items)}


@router.get("/{form_id}")
def get_form(form_id: int) -> dict:
    row = query_one(
        """SELECT f.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM forms f LEFT JOIN equipment e ON e.id = f.equipment_id
            WHERE f.id = ?""",
        (form_id,),
    )
    if row is None:
        raise HTTPException(404, "Không tìm thấy biểu mẫu")
    item = row_to_dict(row, JSON_FIELDS)
    item["form_type_label"] = FORM_LABELS.get(item["form_type"], item["form_type"])
    return item


@router.post("", status_code=201)
def create_form(payload: FormIn) -> dict:
    new_id = execute(
        """INSERT INTO forms (code, title, form_type, work_type, equipment_id, purpose,
                              conditions, safety, rows, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload.code, payload.title, payload.form_type, payload.work_type,
            payload.equipment_id, payload.purpose, payload.conditions,
            dump_json(payload.safety), dump_json([r.model_dump() for r in payload.rows]),
            payload.notes,
        ),
    )
    _reindex(new_id)
    return get_form(new_id)


@router.put("/{form_id}")
def update_form(form_id: int, payload: FormIn) -> dict:
    if query_one("SELECT id FROM forms WHERE id = ?", (form_id,)) is None:
        raise HTTPException(404, "Không tìm thấy biểu mẫu")
    execute(
        """UPDATE forms SET code = ?, title = ?, form_type = ?, work_type = ?, equipment_id = ?,
                  purpose = ?, conditions = ?, safety = ?, rows = ?, notes = ?,
                  updated_at = datetime('now')
            WHERE id = ?""",
        (
            payload.code, payload.title, payload.form_type, payload.work_type,
            payload.equipment_id, payload.purpose, payload.conditions,
            dump_json(payload.safety), dump_json([r.model_dump() for r in payload.rows]),
            payload.notes, form_id,
        ),
    )
    _reindex(form_id)
    return get_form(form_id)


@router.post("/{form_id}/duplicate", status_code=201)
def duplicate_form(form_id: int) -> dict:
    source = get_form(form_id)
    new_id = execute(
        """INSERT INTO forms (code, title, form_type, work_type, equipment_id, purpose,
                              conditions, safety, rows, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            source["code"], f"{source['title']} (bản sao)", source["form_type"],
            source["work_type"], source["equipment_id"], source["purpose"],
            source["conditions"], dump_json(source["safety"]), dump_json(source["rows"]),
            source["notes"],
        ),
    )
    _reindex(new_id)
    return get_form(new_id)


@router.delete("/{form_id}", status_code=204)
def delete_form(form_id: int) -> None:
    if query_one("SELECT id FROM forms WHERE id = ?", (form_id,)) is None:
        raise HTTPException(404, "Không tìm thấy biểu mẫu")
    execute("DELETE FROM forms WHERE id = ?", (form_id,))
    remove_record("bieu_mau", form_id)


def _reindex(form_id: int) -> None:
    form = get_form(form_id)
    index_record(
        "bieu_mau",
        form_id,
        title=f"{form['form_type_label']}: {form['title']}",
        category="bieu_mau",
        equipment_id=form["equipment_id"],
        text=render_form(form, form["equipment_name"]),
    )
