"""Soi một câu hỏi xem hai nhánh truy hồi xếp hạng thế nào.

Chạy:  python -m backend.chandoan "câu hỏi" [-- từ khoá cần thấy trong đáp án]

Khi một câu hỏi ra sai, chỉ nhìn kết quả cuối thì không biết lỗi nằm ở nhánh từ
khoá, nhánh ngữ nghĩa hay ở bước hợp nhất. Công cụ này in thứ hạng của cùng một
đoạn ở cả ba nơi để chỉ đúng chỗ cần sửa.
"""
from __future__ import annotations

import sys

from .db import init_db, query
from .rag import embeddings
from .rag.index import CANDIDATE_FACTOR, _bm25, index
from .rag.textutils import normalize, tokenize


def _rank_of(ranking: list[tuple[int, float]], chunk_id: int) -> str:
    for i, (cid, _) in enumerate(ranking, start=1):
        if cid == chunk_id:
            return str(i)
    return "—"


def run(question: str, needle: str = "", top_k: int = 8) -> None:
    init_db()
    index.ensure_ready()

    probe = embeddings.probe()
    print(f"Embedding: {'đang chạy' if probe['ok'] else 'TẮT — ' + probe['reason']}")
    print(f"Tổng đoạn chỉ mục: {index.size}\n")

    terms = tokenize(question)
    with index._lock:
        entries = list(index._entries)
        meta = dict(index._meta)
        df, avg_len = index._df, index._avg_len

    def keep(chunk_id: int) -> bool:
        return chunk_id in meta

    lexical = _bm25(entries, terms, df, avg_len, keep)[: top_k * CANDIDATE_FACTOR]
    semantic = index._vector_search(question, keep, top_k * CANDIDATE_FACTOR)

    print(f"{'hạng':>5} {'từ khoá':>8} {'ngữ nghĩa':>10}  nội dung")
    for i, hit in enumerate(index.search(question, top_k=top_k), start=1):
        mark = " ←" if needle and normalize(needle) in normalize(hit.text) else ""
        text = " ".join(hit.excerpt.split())[:70]
        print(f"{i:>5} {_rank_of(lexical, hit.chunk_id):>8} "
              f"{_rank_of(semantic, hit.chunk_id):>10}  {text}{mark}")

    if needle:
        # Lọc bằng Python chứ không dùng lower() của SQLite: hàm đó chỉ hạ chữ
        # ASCII nên "Áp lực" không bao giờ khớp "áp lực".
        wanted = normalize(needle)
        rows = [r for r in query("SELECT id, text FROM chunks")
                if wanted in normalize(r["text"])]
        print(f"\nĐoạn chứa {needle!r}: {len(rows)}")
        for row in rows[:5]:
            print(f"  chunk {row['id']}: từ khoá hạng {_rank_of(lexical, row['id'])}, "
                  f"ngữ nghĩa hạng {_rank_of(semantic, row['id'])}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        raise SystemExit(1)
    if "--" in args:
        cut = args.index("--")
        run(" ".join(args[:cut]), " ".join(args[cut + 1:]))
    else:
        run(" ".join(args))
