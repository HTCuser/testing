from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException

from ..db import dump_json, execute, query, query_one, row_to_dict, rows_to_dicts
from ..models import EquipmentIn
from ..rag.textutils import normalize

router = APIRouter(prefix="/api/equipment", tags=["Thiết bị"])

JSON_FIELDS = ("specs",)


@router.get("")
def list_equipment(q: str = "", system: str = "") -> dict:
    rows = query(
        """
        SELECT e.*,
               (SELECT COUNT(*) FROM documents d WHERE d.equipment_id = e.id) AS n_documents,
               (SELECT COUNT(*) FROM procedures p WHERE p.equipment_id = e.id) AS n_procedures,
               (SELECT COUNT(*) FROM incidents i WHERE i.equipment_id = e.id) AS n_incidents
          FROM equipment e
         ORDER BY e.system, e.code
        """
    )
    items = rows_to_dicts(rows, JSON_FIELDS)
    if system:
        items = [it for it in items if it["system"] == system]
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(f"{it['code']} {it['name']} {it['system']} {it['model']} {it['manufacturer']}")
        ]
    systems = sorted({r["system"] for r in rows if r["system"]})
    return {"items": items, "systems": systems, "total": len(items)}


@router.get("/{equipment_id}")
def get_equipment(equipment_id: int) -> dict:
    row = query_one("SELECT * FROM equipment WHERE id = ?", (equipment_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy thiết bị")
    item = row_to_dict(row, JSON_FIELDS)
    item["documents"] = rows_to_dicts(
        query(
            """SELECT id, title, category, source_kind, n_chunks, created_at
                 FROM documents WHERE equipment_id = ? ORDER BY created_at DESC""",
            (equipment_id,),
        )
    )
    item["procedures"] = rows_to_dicts(
        query(
            "SELECT id, code, title, kind FROM procedures WHERE equipment_id = ? ORDER BY kind, title",
            (equipment_id,),
        )
    )
    item["incidents"] = rows_to_dicts(
        query(
            "SELECT id, code, title, severity FROM incidents WHERE equipment_id = ? ORDER BY title",
            (equipment_id,),
        )
    )
    return item


@router.post("", status_code=201)
def create_equipment(payload: EquipmentIn) -> dict:
    try:
        new_id = execute(
            """INSERT INTO equipment (code, name, system, location, manufacturer, model,
                                      commissioned, specs, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.code, payload.name, payload.system, payload.location,
                payload.manufacturer, payload.model, payload.commissioned,
                dump_json([s.model_dump() for s in payload.specs]), payload.notes,
            ),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Mã thiết bị '{payload.code}' đã tồn tại")
    return get_equipment(new_id)


@router.put("/{equipment_id}")
def update_equipment(equipment_id: int, payload: EquipmentIn) -> dict:
    if query_one("SELECT id FROM equipment WHERE id = ?", (equipment_id,)) is None:
        raise HTTPException(404, "Không tìm thấy thiết bị")
    try:
        execute(
            """UPDATE equipment SET code = ?, name = ?, system = ?, location = ?,
                      manufacturer = ?, model = ?, commissioned = ?, specs = ?, notes = ?,
                      updated_at = datetime('now')
                WHERE id = ?""",
            (
                payload.code, payload.name, payload.system, payload.location,
                payload.manufacturer, payload.model, payload.commissioned,
                dump_json([s.model_dump() for s in payload.specs]), payload.notes,
                equipment_id,
            ),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"Mã thiết bị '{payload.code}' đã tồn tại")
    return get_equipment(equipment_id)


@router.delete("/{equipment_id}", status_code=204)
def delete_equipment(equipment_id: int) -> None:
    if query_one("SELECT id FROM equipment WHERE id = ?", (equipment_id,)) is None:
        raise HTTPException(404, "Không tìm thấy thiết bị")
    execute("DELETE FROM equipment WHERE id = ?", (equipment_id,))
