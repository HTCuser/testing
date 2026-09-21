"""Nhà cung cấp embedding (tuỳ chọn).

Hệ thống hoạt động đầy đủ khi không cấu hình embedding — khi đó truy hồi chỉ dùng
BM25. Bật embedding sẽ thêm nhánh tìm kiếm ngữ nghĩa vào điểm số lai.
"""
from __future__ import annotations

import array
import math

import httpx

from .. import config


class EmbeddingError(RuntimeError):
    pass


def model_name() -> str:
    if config.EMBEDDING_PROVIDER == "voyage":
        return f"voyage:{config.VOYAGE_MODEL}"
    if config.EMBEDDING_PROVIDER == "openai_compatible":
        return f"openai:{config.OPENAI_EMBEDDING_MODEL}"
    return ""


def probe() -> dict:
    """Thử gọi một lần để biết dịch vụ embedding có thật sự dùng được không.

    Truy hồi tự lùi về BM25 khi gọi hỏng, nên không có bước kiểm tra này thì
    vận hành viên tưởng đang chạy ngữ nghĩa trong khi thực tế không phải.
    """
    if not config.embeddings_enabled():
        return {"ok": False, "reason": "Chưa bật embedding trong cấu hình."}
    try:
        vector = embed(["kiểm tra kết nối"], is_query=True)[0]
    except Exception as exc:
        return {"ok": False, "reason": f"{exc.__class__.__name__}: {exc}"}
    return {"ok": True, "dimensions": len(vector), "reason": ""}


def embed(texts: list[str], *, is_query: bool = False) -> list[list[float]]:
    if not texts:
        return []
    provider = config.EMBEDDING_PROVIDER
    if provider == "voyage":
        return _voyage(texts, is_query=is_query)
    if provider == "openai_compatible":
        return _openai_compatible(texts)
    raise EmbeddingError("Chưa bật embedding trong cấu hình.")


def _voyage(texts: list[str], *, is_query: bool) -> list[list[float]]:
    if not config.VOYAGE_API_KEY:
        raise EmbeddingError("Thiếu VOYAGE_API_KEY.")
    resp = httpx.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {config.VOYAGE_API_KEY}"},
        json={
            "input": texts,
            "model": config.VOYAGE_MODEL,
            "input_type": "query" if is_query else "document",
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda d: d.get("index", 0))]


def _openai_compatible(texts: list[str]) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    if config.OPENAI_API_KEY:
        headers["Authorization"] = f"Bearer {config.OPENAI_API_KEY}"
    resp = httpx.post(
        f"{config.OPENAI_BASE_URL.rstrip('/')}/embeddings",
        headers=headers,
        json={"input": texts, "model": config.OPENAI_EMBEDDING_MODEL},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda d: d.get("index", 0))]


def to_blob(vector: list[float]) -> bytes:
    return array.array("f", vector).tobytes()


def from_blob(blob: bytes) -> list[float]:
    arr = array.array("f")
    arr.frombytes(blob)
    return list(arr)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
