from __future__ import annotations

from fastapi import APIRouter

from .. import config, usage
from ..db import query, query_one, rows_to_dicts
from ..rag import embeddings, indexer
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
            "quota": usage.status(),
            # Tên file cấu hình đọc được, để trang Cấu hình chỉ ra ngay khi
            # người dùng đặt key vào sai file hoặc sai thư mục.
            "env_file": config.ENV_FILE.name if config.ENV_FILE else "",
            "base_dir": str(config.BASE_DIR),
        },
        "embeddings": {
            "enabled": config.embeddings_enabled(),
            "provider": config.EMBEDDING_PROVIDER,
            "model": embeddings.model_name(),
            "indexed_vectors": _count("embeddings"),
            # Truy hồi tự lùi về BM25 khi gọi hỏng, nên phải thử thật mới biết
            # dịch vụ embedding có đang chạy hay không.
            "reachable": embeddings.probe(),
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
    # Đọc lại tệp gốc trước: cách trích xuất và cắt đoạn thay đổi theo từng bản
    # nâng cấp, mà nội dung đã cắt nằm sẵn trong CSDL. Chỉ dựng lại chỉ mục thì
    # thư viện cũ vẫn giữ nguyên cách cắt cũ và người dùng tưởng bản vá không chạy.
    files = indexer.reextract_all_files()
    index.rebuild()
    # Dựng lại chỉ mục phải sinh luôn vector, nếu không thì bật embedding trên
    # thư viện đã nạp sẽ không có vector nào và tìm kiếm ngữ nghĩa im lặng không chạy.
    embedded = indexer.embed_all_documents()
    return {"indexed_chunks": index.size, **files, **embedded}
