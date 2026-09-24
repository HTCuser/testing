"""Chỉ mục truy hồi lai: BM25 từ khoá + vector ngữ nghĩa (nếu bật embedding).

Chỉ mục BM25 nằm trong bộ nhớ, dựng lại từ bảng `chunks` mỗi khi kho tài liệu
thay đổi. Với quy mô thư viện kỹ thuật một nhà máy (hàng chục nghìn chunk) cách
này đủ nhanh và không cần thêm hạ tầng vector database.
"""
from __future__ import annotations

import math
import threading
from collections import Counter
from dataclasses import dataclass, field

from .. import config
from ..db import query
from . import embeddings
from .textutils import snippet, tokenize

K1 = 1.5
B = 0.75
# Hằng số RRF. Giá trị 60 quen thuộc lấy từ bài báo gốc, tính cho bảng xếp hạng
# hàng nghìn kết quả. Với pool vài chục như ở đây thì nó làm điểm số phẳng gần
# như nhau — hạng 1 chỉ hơn hạng cuối 1,6 lần — nên một đoạn đứng đầu ở nhánh
# ngữ nghĩa vẫn thua một đoạn tầm thường ở cả hai nhánh. Giảm xuống để thứ hạng
# cao thực sự có trọng lượng.
RRF_K = 20

# Số ứng viên lấy từ mỗi nhánh trước khi hợp nhất, tính theo bội của top_k.
# Lấy quá ít thì đoạn đúng bị loại ngay từ vòng ứng viên.
CANDIDATE_FACTOR = 12


@dataclass
class Hit:
    chunk_id: int
    document_id: int
    doc_title: str
    category: str
    source_kind: str
    source_id: int | None
    equipment_id: int | None
    equipment_name: str
    page: int | None
    heading: str
    text: str
    score: float
    excerpt: str = ""


@dataclass
class _Entry:
    chunk_id: int
    document_id: int
    tf: Counter = field(default_factory=Counter)
    length: int = 0


class HybridIndex:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: list[_Entry] = []
        self._df: Counter = Counter()
        self._avg_len: float = 0.0
        self._meta: dict[int, dict] = {}
        self._ready = False

    # ---------------------------------------------------------------- dựng chỉ mục

    def rebuild(self) -> None:
        rows = query(
            """
            SELECT c.id, c.document_id, c.page, c.heading, c.text,
                   d.title, d.category, d.source_kind, d.source_id, d.equipment_id,
                   COALESCE(e.name, '') AS equipment_name
              FROM chunks c
              JOIN documents d ON d.id = c.document_id
         LEFT JOIN equipment e ON e.id = d.equipment_id
             ORDER BY c.document_id, c.ord
            """
        )
        entries: list[_Entry] = []
        df: Counter = Counter()
        meta: dict[int, dict] = {}
        total_len = 0

        for row in rows:
            # Tiêu đề tài liệu và tiêu đề mục được đưa vào chuỗi lập chỉ mục để
            # câu hỏi nêu tên thiết bị vẫn khớp được đoạn không nhắc lại tên đó.
            indexable = f"{row['title']}\n{row['equipment_name']}\n{row['heading']}\n{row['text']}"
            tokens = tokenize(indexable)
            entry = _Entry(chunk_id=row["id"], document_id=row["document_id"])
            entry.tf = Counter(tokens)
            entry.length = len(tokens)
            total_len += entry.length
            entries.append(entry)
            for term in entry.tf:
                df[term] += 1
            meta[row["id"]] = dict(row)

        with self._lock:
            self._entries = entries
            self._df = df
            self._meta = meta
            self._avg_len = (total_len / len(entries)) if entries else 0.0
            self._ready = True

    def ensure_ready(self) -> None:
        if not self._ready:
            self.rebuild()

    @property
    def size(self) -> int:
        return len(self._entries)

    # ------------------------------------------------------------------ tìm kiếm

    def search(
        self,
        question: str,
        *,
        top_k: int | None = None,
        category: str | None = None,
        equipment_id: int | None = None,
        source_kind: str | None = None,
        document_id: int | None = None,
    ) -> list[Hit]:
        self.ensure_ready()
        top_k = top_k or config.TOP_K
        terms = tokenize(question)
        if not terms:
            return []

        with self._lock:
            entries = list(self._entries)
            df = self._df
            avg_len = self._avg_len
            meta = dict(self._meta)

        def keep(chunk_id: int) -> bool:
            info = meta.get(chunk_id)
            if info is None:
                return False
            if category and info["category"] != category:
                return False
            if source_kind and info["source_kind"] != source_kind:
                return False
            if equipment_id and info["equipment_id"] != equipment_id:
                return False
            if document_id and info["document_id"] != document_id:
                return False
            return True

        lexical = _bm25(entries, terms, df, avg_len, keep)[: top_k * CANDIDATE_FACTOR]

        semantic = self._vector_search(question, keep, top_k * CANDIDATE_FACTOR)

        fused = _reciprocal_rank_fusion(lexical, semantic)

        def build(chunk_id: int, score: float) -> Hit:
            info = meta[chunk_id]
            return Hit(
                chunk_id=chunk_id,
                document_id=info["document_id"],
                doc_title=info["title"],
                category=info["category"],
                source_kind=info["source_kind"],
                source_id=info["source_id"],
                equipment_id=info["equipment_id"],
                equipment_name=info["equipment_name"],
                page=info["page"],
                heading=info["heading"],
                text=info["text"],
                score=round(score, 5),
                excerpt=snippet(info["text"], terms),
            )

        # Không giới hạn số đoạn mỗi tài liệu. Giới hạn đó sinh ra để một quy
        # trình dài không chiếm hết kết quả, nhưng khi nhà máy chỉ có vài quy
        # trình lớn thì câu hỏi về một hệ thống lẽ ra phải lấy phần lớn kết quả
        # từ đúng quy trình của hệ thống đó. Đo trên hai quy trình thật: bỏ giới
        # hạn đưa 10/10 câu hỏi vào top 8, giữ lại chỉ được 9/10.
        return [build(chunk_id, score) for chunk_id, score in fused[:top_k]]

    def _vector_search(self, question: str, keep, limit: int) -> list[tuple[int, float]]:
        if not config.embeddings_enabled():
            return []
        try:
            vector = embeddings.embed([question], is_query=True)[0]
        except Exception:
            return []
        rows = query("SELECT chunk_id, vector FROM embeddings")
        scored: list[tuple[int, float]] = []
        for row in rows:
            if not keep(row["chunk_id"]):
                continue
            score = embeddings.cosine(vector, embeddings.from_blob(row["vector"]))
            if score > 0:
                scored.append((row["chunk_id"], score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]


def _bm25(entries, terms, df, avg_len, keep) -> list[tuple[int, float]]:
    """Chấm điểm BM25 cho toàn bộ đoạn, trả về bảng xếp hạng giảm dần."""
    n_docs = len(entries) or 1
    scored: list[tuple[int, float]] = []
    for entry in entries:
        if not keep(entry.chunk_id):
            continue
        score = 0.0
        for term in terms:
            tf = entry.tf.get(term)
            if not tf:
                continue
            idf = math.log(1 + (n_docs - df[term] + 0.5) / (df[term] + 0.5))
            denom = tf + K1 * (1 - B + B * entry.length / (avg_len or 1))
            score += idf * (tf * (K1 + 1)) / denom
        if score > 0:
            scored.append((entry.chunk_id, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


def _reciprocal_rank_fusion(*rankings: list[tuple[int, float]]) -> list[tuple[int, float]]:
    """Hợp nhất nhiều bảng xếp hạng bằng RRF — không cần chuẩn hoá thang điểm."""
    combined: Counter = Counter()
    for ranking in rankings:
        for rank, (chunk_id, _) in enumerate(ranking, start=1):
            combined[chunk_id] += 1.0 / (RRF_K + rank)
    return combined.most_common()


index = HybridIndex()
