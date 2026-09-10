from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import dump_json, execute, query, query_one, row_to_dict, rows_to_dicts
from ..models import IncidentIn
from ..rag.indexer import (
    SEVERITY_LABELS,
    SOURCE_LABELS,
    index_record,
    remove_record,
    render_incident,
)
from ..rag.textutils import normalize

router = APIRouter(prefix="/api/incidents", tags=["Xử lý sự cố"])

JSON_FIELDS = ("symptoms", "causes", "actions")


@router.get("/meta")
def meta() -> dict:
    return {
        "severities": [{"value": k, "label": v} for k, v in SEVERITY_LABELS.items()],
        "sources": [{"value": k, "label": v} for k, v in SOURCE_LABELS.items()],
    }


@router.get("")
def list_incidents(q: str = "", severity: str = "", source: str = "",
                   equipment_id: int | None = None) -> dict:
    rows = query(
        """SELECT i.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM incidents i LEFT JOIN equipment e ON e.id = i.equipment_id
            ORDER BY i.updated_at DESC, i.id DESC"""
    )
    items = rows_to_dicts(rows, JSON_FIELDS)
    if severity:
        items = [it for it in items if it["severity"] == severity]
    if source:
        items = [it for it in items if it["source"] == source]
    if equipment_id:
        items = [it for it in items if it["equipment_id"] == equipment_id]
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(
                f"{it['code']} {it['title']} {it['tags']} {it['equipment_name']} "
                f"{' '.join(it['symptoms'])} {' '.join(it['causes'])}"
            )
        ]
    for item in items:
        item["severity_label"] = SEVERITY_LABELS.get(item["severity"], item["severity"])
        item["source_label"] = SOURCE_LABELS.get(item["source"], item["source"])
    return {"items": items, "total": len(items)}


@router.get("/{incident_id}")
def get_incident(incident_id: int) -> dict:
    row = query_one(
        """SELECT i.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
             FROM incidents i LEFT JOIN equipment e ON e.id = i.equipment_id
            WHERE i.id = ?""",
        (incident_id,),
    )
    if row is None:
        raise HTTPException(404, "Không tìm thấy hồ sơ sự cố")
    item = row_to_dict(row, JSON_FIELDS)
    item["severity_label"] = SEVERITY_LABELS.get(item["severity"], item["severity"])
    item["source_label"] = SOURCE_LABELS.get(item["source"], item["source"])
    return item


@router.post("", status_code=201)
def create_incident(payload: IncidentIn) -> dict:
    new_id = execute(
        """INSERT INTO incidents (code, title, equipment_id, severity, source, symptoms, causes,
                                  actions, prevention, lesson, occurred_at, tags, source_ref,
                                  document_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload.code, payload.title, payload.equipment_id, payload.severity, payload.source,
            dump_json(payload.symptoms), dump_json(payload.causes), dump_json(payload.actions),
            payload.prevention, payload.lesson, payload.occurred_at, payload.tags,
            payload.source_ref, payload.document_id,
        ),
    )
    _reindex(new_id)
    return get_incident(new_id)


@router.put("/{incident_id}")
def update_incident(incident_id: int, payload: IncidentIn) -> dict:
    if query_one("SELECT id FROM incidents WHERE id = ?", (incident_id,)) is None:
        raise HTTPException(404, "Không tìm thấy hồ sơ sự cố")
    execute(
        """UPDATE incidents SET code = ?, title = ?, equipment_id = ?, severity = ?, source = ?,
                  symptoms = ?, causes = ?, actions = ?, prevention = ?, lesson = ?,
                  occurred_at = ?, tags = ?, source_ref = ?, document_id = ?,
                  updated_at = datetime('now')
            WHERE id = ?""",
        (
            payload.code, payload.title, payload.equipment_id, payload.severity, payload.source,
            dump_json(payload.symptoms), dump_json(payload.causes), dump_json(payload.actions),
            payload.prevention, payload.lesson, payload.occurred_at, payload.tags,
            payload.source_ref, payload.document_id, incident_id,
        ),
    )
    _reindex(incident_id)
    return get_incident(incident_id)


@router.delete("/{incident_id}", status_code=204)
def delete_incident(incident_id: int) -> None:
    if query_one("SELECT id FROM incidents WHERE id = ?", (incident_id,)) is None:
        raise HTTPException(404, "Không tìm thấy hồ sơ sự cố")
    execute("DELETE FROM incidents WHERE id = ?", (incident_id,))
    remove_record("su_co", incident_id)


def _reindex(incident_id: int) -> None:
    inc = get_incident(incident_id)
    index_record(
        "su_co",
        incident_id,
        title=f"{inc['code'] + ' — ' if inc['code'] else ''}{inc['title']}",
        category="bai_hoc_kinh_nghiem" if inc["source"] != "quy_trinh" else "quy_trinh_su_co",
        equipment_id=inc["equipment_id"],
        text=render_incident(inc, inc["equipment_name"]),
    )
