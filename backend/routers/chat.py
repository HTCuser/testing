from __future__ import annotations

import time

from fastapi import APIRouter

from .. import config
from ..db import dump_json, execute, query, rows_to_dicts
from ..models import AskIn
from ..rag.generator import answer
from ..rag.index import Hit, index

router = APIRouter(prefix="/api", tags=["Trợ lý kỹ thuật"])


def _serialize(hit: Hit, ordinal: int) -> dict:
    return {
        "n": ordinal,
        "chunk_id": hit.chunk_id,
        "document_id": hit.document_id,
        "doc_title": hit.doc_title,
        "category": hit.category,
        "source_kind": hit.source_kind,
        "source_id": hit.source_id,
        "equipment_id": hit.equipment_id,
        "equipment_name": hit.equipment_name,
        "page": hit.page,
        "heading": hit.heading,
        "excerpt": hit.excerpt,
        "score": hit.score,
    }


@router.post("/ask")
def ask(payload: AskIn) -> dict:
    started = time.perf_counter()
    hits = index.search(
        payload.question,
        top_k=payload.top_k,
        category=payload.category or None,
        equipment_id=payload.equipment_id,
        source_kind=payload.source_kind or None,
    )
    text, mode = answer(payload.question, hits)
    latency_ms = int((time.perf_counter() - started) * 1000)
    sources = [_serialize(h, i) for i, h in enumerate(hits, start=1)]

    execute(
        "INSERT INTO chat_logs (question, answer, sources, mode, latency_ms) VALUES (?, ?, ?, ?, ?)",
        (payload.question, text, dump_json(sources), mode, latency_ms),
    )
    return {
        "question": payload.question,
        "answer": text,
        "mode": mode,
        "sources": sources,
        "latency_ms": latency_ms,
        "generation_enabled": config.generation_enabled(),
    }


@router.get("/search")
def search(q: str = "", top_k: int = 10, category: str = "",
           equipment_id: int | None = None, source_kind: str = "") -> dict:
    if not q.strip():
        return {"items": [], "total": 0}
    hits = index.search(
        q,
        top_k=top_k,
        category=category or None,
        equipment_id=equipment_id,
        source_kind=source_kind or None,
    )
    return {
        "items": [_serialize(h, i) for i, h in enumerate(hits, start=1)],
        "total": len(hits),
    }


@router.get("/chat-history")
def chat_history(limit: int = 20) -> dict:
    rows = query(
        "SELECT id, question, mode, latency_ms, created_at FROM chat_logs ORDER BY id DESC LIMIT ?",
        (min(limit, 100),),
    )
    return {"items": rows_to_dicts(rows)}
