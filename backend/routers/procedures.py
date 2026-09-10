from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import dump_json, execute, query, query_one, row_to_dict, rows_to_dicts
from ..models import ProcedureIn
from ..rag.indexer import KIND_LABELS, index_record, remove_record, render_procedure
from ..rag.textutils import normalize

router = APIRouter(prefix="/api/procedures", tags=["Quy trình"])

JSON_FIELDS = ("safety", "steps")
CATEGORY_BY_KIND = {
    "van_hanh": "quy_trinh_van_hanh",
    "bao_duong": "quy_trinh_bao_duong",
    "su_co": "quy_trinh_su_co",
}


@router.get("/kinds")
def kinds() -> dict:
    return {"items": [{"value": k, "label": v} for k, v in KIND_LABELS.items()]}


@router.get("")
def list_procedures(q: str = "", kind: str = "", equipment_id: int | None = None) -> dict:
    rows = query(
        """SELECT p.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM procedures p LEFT JOIN equipment e ON e.id = p.equipment_id
            ORDER BY p.kind, p.code, p.title"""
    )
    items = rows_to_dicts(rows, JSON_FIELDS)
    if kind:
        items = [it for it in items if it["kind"] == kind]
    if equipment_id:
        items = [it for it in items if it["equipment_id"] == equipment_id]
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(f"{it['code']} {it['title']} {it['summary']} {it['equipment_name']}")
        ]
    for item in items:
        item["kind_label"] = KIND_LABELS.get(item["kind"], item["kind"])
        item["n_steps"] = len(item["steps"])
    return {"items": items, "total": len(items)}


@router.get("/{procedure_id}")
def get_procedure(procedure_id: int) -> dict:
    row = query_one(
        """SELECT p.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM procedures p LEFT JOIN equipment e ON e.id = p.equipment_id
            WHERE p.id = ?""",
        (procedure_id,),
    )
    if row is None:
        raise HTTPException(404, "Không tìm thấy quy trình")
    item = row_to_dict(row, JSON_FIELDS)
    item["kind_label"] = KIND_LABELS.get(item["kind"], item["kind"])
    return item


@router.post("", status_code=201)
def create_procedure(payload: ProcedureIn) -> dict:
    new_id = execute(
        """INSERT INTO procedures (code, title, kind, equipment_id, summary, conditions,
                                   safety, steps, source_ref, document_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload.code, payload.title, payload.kind, payload.equipment_id,
            payload.summary, payload.conditions, dump_json(payload.safety),
            dump_json([s.model_dump() for s in payload.steps]),
            payload.source_ref, payload.document_id,
        ),
    )
    _reindex(new_id)
    return get_procedure(new_id)


@router.put("/{procedure_id}")
def update_procedure(procedure_id: int, payload: ProcedureIn) -> dict:
    if query_one("SELECT id FROM procedures WHERE id = ?", (procedure_id,)) is None:
        raise HTTPException(404, "Không tìm thấy quy trình")
    execute(
        """UPDATE procedures SET code = ?, title = ?, kind = ?, equipment_id = ?, summary = ?,
                  conditions = ?, safety = ?, steps = ?, source_ref = ?, document_id = ?,
                  updated_at = datetime('now')
            WHERE id = ?""",
        (
            payload.code, payload.title, payload.kind, payload.equipment_id,
            payload.summary, payload.conditions, dump_json(payload.safety),
            dump_json([s.model_dump() for s in payload.steps]),
            payload.source_ref, payload.document_id, procedure_id,
        ),
    )
    _reindex(procedure_id)
    return get_procedure(procedure_id)


@router.delete("/{procedure_id}", status_code=204)
def delete_procedure(procedure_id: int) -> None:
    if query_one("SELECT id FROM procedures WHERE id = ?", (procedure_id,)) is None:
        raise HTTPException(404, "Không tìm thấy quy trình")
    execute("DELETE FROM procedures WHERE id = ?", (procedure_id,))
    remove_record("quy_trinh", procedure_id)


def _reindex(procedure_id: int) -> None:
    proc = get_procedure(procedure_id)
    index_record(
        "quy_trinh",
        procedure_id,
        title=f"{proc['code'] + ' — ' if proc['code'] else ''}{proc['title']}",
        category=CATEGORY_BY_KIND.get(proc["kind"], "quy_trinh_van_hanh"),
        equipment_id=proc["equipment_id"],
        text=render_procedure(proc, proc["equipment_name"]),
    )
