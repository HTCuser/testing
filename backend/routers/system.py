from __future__ import annotations

from fastapi import APIRouter

from .. import config
from ..db import query, query_one, rows_to_dicts
from ..rag import embeddings
from ..rag.index import index

router = APIRouter(prefix="/api", tags=["Hệ thống"])


def _count(table: str, where: str = "", params: tuple = ()) -> int:
    row = query_one(f"SELECT COUNT(*) AS n FROM {table} {where}", params)
    return row["n"] if row else 0


@router.get("/stats")
def stats() -> dict:
    index.ensure_ready()
    return {
        "plant_name": config.PLANT_NAME,
        "counters": {
            "documents": _count("documents", "WHERE source_kind = 'tep'"),
            "equipment": _count("equipment"),
            "procedures": _count("procedures"),
            "incidents": _count("incidents"),
            "forms": _count("forms"),
            "chunks": _count("chunks"),
            "queries": _count("chat_logs"),
        },
        "by_procedure_kind": {
            row["kind"]: row["n"]
            for row in query("SELECT kind, COUNT(*) AS n FROM procedures GROUP BY kind")
        },
        "by_incident_severity": {
            row["severity"]: row["n"]
            for row in query("SELECT severity, COUNT(*) AS n FROM incidents GROUP BY severity")
        },
        "by_category": {
            row["category"]: row["n"]
            for row in query(
                "SELECT category, COUNT(*) AS n FROM documents GROUP BY category ORDER BY n DESC"
            )
        },
        "recent_documents": rows_to_dicts(
            query(
                """SELECT id, title, category, source_kind, index_status, n_chunks, created_at
                     FROM documents ORDER BY id DESC LIMIT 6"""
            )
        ),
        "recent_incidents": rows_to_dicts(
            query(
                """SELECT i.id, i.code, i.title, i.severity, i.source, i.updated_at,
                          COALESCE(e.name, '') AS equipment_name
                     FROM incidents i LEFT JOIN equipment e ON e.id = i.equipment_id
                    ORDER BY i.updated_at DESC LIMIT 6"""
            )
        ),
        "recent_queries": rows_to_dicts(
            query("SELECT question, mode, created_at FROM chat_logs ORDER BY id DESC LIMIT 6")
        ),
        "failed_documents": rows_to_dicts(
            query(
                "SELECT id, title, index_error FROM documents WHERE index_status = 'loi' LIMIT 10"
            )
        ),
    }


@router.get("/config")
def runtime_config() -> dict:
    index.ensure_ready()
    return {
        "plant_name": config.PLANT_NAME,
        "org_name": config.ORG_NAME,
        "org_unit": config.ORG_UNIT,
        "generation": {
            "enabled": config.generation_enabled(),
            "model": config.ANTHROPIC_MODEL if config.generation_enabled() else "",
        },
        "embeddings": {
            "enabled": config.embeddings_enabled(),
            "provider": config.EMBEDDING_PROVIDER,
            "model": embeddings.model_name(),
            "indexed_vectors": _count("embeddings"),
        },
        "retrieval": {
            "chunk_size": config.CHUNK_SIZE,
            "chunk_overlap": config.CHUNK_OVERLAP,
            "top_k": config.TOP_K,
            "indexed_chunks": index.size,
        },
        "upload": {
            "max_mb": config.MAX_UPLOAD_MB,
            "allowed": sorted(config.ALLOWED_EXTENSIONS),
        },
    }


@router.post("/reindex")
def reindex_all() -> dict:
    index.rebuild()
    return {"indexed_chunks": index.size}
