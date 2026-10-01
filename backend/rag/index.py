"""Chỉ mục truy hồi lai: BM25 từ khoá + vector ngữ nghĩa (nếu bật embedding).

Chỉ mục BM25 nằm trong bộ nhớ, dựng lại từ bảng `chunks` mỗi khi kho tài liệu
thay đổi. Với quy mô thư viện kỹ thuật một nhà máy (hàng chục nghìn chunk) cách
này đủ nhanh và không cần thêm hạ tầng vector database.
"""
from __future__ import annotations

import math
import re
import threading
from collections import Counter
from dataclasses import dataclass, field

from .. import config
from ..db import query, query_one
from . import embeddings, glossary
from .textutils import normalize, snippet, tokenize

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
        self._glossary: dict[str, set[str]] = {}
        self._ready = False

    # ---------------------------------------------------------------- dựng chỉ mục

    def rebuild(self) -> None:
        rows = query(
            """
            SELECT c.id, c.document_id, c.page, c.heading, c.text,
                   d.title, d.doc_code, d.category, d.source_kind, d.source_id, d.equipment_id,
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
        table = glossary.build(row["text"] for row in rows)

        for row in rows:
            # Tiêu đề tài liệu và tiêu đề mục được đưa vào chuỗi lập chỉ mục để
            # câu hỏi nêu tên thiết bị vẫn khớp được đoạn không nhắc lại tên đó.
            # Thêm mọi tên gọi của các mã bảo vệ đoạn này nhắc tới, để hỏi theo
            # tên nào cũng tìm được.
            aliases = glossary.expand_document(row["text"], table)
            indexable = f"{row['title']} {row['doc_code']}\n{row['equipment_name']}\n{row['heading']}\n{row['text']}"
            tokens = tokenize(indexable)
            entry = _Entry(chunk_id=row["id"], document_id=row["document_id"])
            # Chỉ lấy từ ghép (bigram) của tên gọi: đó mới là phần phân biệt chức
            # năng ("lệch MBA", "dọc MBA"). Từ đơn như "máy", "cắt" có ở khắp nơi,
            # thêm vào chỉ làm nhiễu các câu hỏi không liên quan tới mã đó.
            entry.tf = Counter(tokens + [t for t in tokenize(aliases) if "_" in t])
            # Độ dài chỉ tính phần nội dung thật. Tính cả tên gọi bổ sung thì
            # đoạn nhắc nhiều mã (ma trận cắt có hàng chục mã) bị phồng độ dài,
            # BM25 phạt oan đúng những đoạn trả lời câu "bảo vệ nào cắt máy cắt nào".
            entry.length = len(tokens)
            total_len += entry.length
            entries.append(entry)
            for term in entry.tf:
                df[term] += 1
            info = dict(row)
            if info["doc_code"]:
                # Trích dẫn kèm mã hiệu để người đọc (và mô hình) gọi đúng quy trình.
                info["title"] = f"{info['title']} ({info['doc_code']})"
            meta[row["id"]] = info

        with self._lock:
            self._entries = entries
            self._df = df
            self._meta = meta
            self._avg_len = (total_len / len(entries)) if entries else 0.0
            self._glossary = table
            self._ready = True

    def ensure_ready(self) -> None:
        if not self._ready:
            self.rebuild()

    @property
    def size(self) -> int:
        return len(self._entries)

    def query_terms(self, question: str) -> list[str]:
        """Từ khoá tìm kiếm của câu hỏi, bổ sung mã bảo vệ theo tên gọi."""
        terms = tokenize(question)
        codes = glossary.expand_query(question, self._glossary)
        # Lặp mã hai lần: người hỏi đã gọi đúng một chức năng cụ thể, mã của nó
        # phải nặng ký hơn các từ chung như "so lệch", "tác động". Số hiệu thiết
        # bị (901, H1, MC273...) cũng vậy: nó quyết định trả lời cho thiết bị nào.
        idents = [t for ident in identifiers(question) for t in tokenize(ident) if "_" not in t]
        return terms + codes * 2 + idents * 2

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
        terms = self.query_terms(question)
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
        fused = _prefer_asked_identifiers(fused, question, meta)

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

    def hit_from_chunk(self, chunk_id: int, score: float = 0.0) -> Hit | None:
        info = self._meta.get(chunk_id)
        if info is None:
            return None
        return Hit(
            chunk_id=chunk_id, document_id=info["document_id"], doc_title=info["title"],
            category=info["category"], source_kind=info["source_kind"], source_id=info["source_id"],
            equipment_id=info["equipment_id"], equipment_name=info["equipment_name"], page=info["page"],
            heading=info["heading"], text=info["text"], score=score, excerpt=snippet(info["text"], []),
        )

    def with_references(self, hits: list[Hit], max_refs: int = 3) -> list[Hit]:
        """Thêm các mục được dẫn chiếu: "thực hiện theo các bước như mục 9.2.7".

        Bản ghi xử lý sự cố hay chỉ ghi "theo mục X" thay vì chép lại các bước.
        Không lấy kèm mục X thì mô hình chỉ còn đoán mục X nói gì — và đoán theo
        số mục là sai khi tài liệu dẫn chiếu nhầm số (gặp thật: quy trình máy cắt
        đầu cực ghi "mục 9.2.7 đối với MC 901" trong khi 9.2.7 là của MC 902).
        Đưa đúng mục X vào để mô hình đối chiếu được tiêu đề với thiết bị.
        """
        self.ensure_ready()
        have = {h.chunk_id for h in hits}
        headed = {(h.document_id, _section_number(h.heading)) for h in hits}
        refs: list[tuple[int, str]] = []
        for h in hits:
            for num in _REF_RE.findall(normalize(section_text(h))):
                key = (h.document_id, num)
                if key not in headed and key not in refs:
                    refs.append(key)
        extra: list[Hit] = []
        for document_id, num in refs[:max_refs]:
            row = query_one(
                "SELECT id FROM chunks WHERE document_id = ? AND (heading = ? OR heading LIKE ? OR heading LIKE ?) "
                "ORDER BY ord LIMIT 1",
                (document_id, num, f"{num}.%", f"{num} %"),
            )
            if row is None or row["id"] in have:
                continue
            # "9.2.7.%" cũng khớp mục con 9.2.7.1 — chấp nhận: mục con nằm trong mục được dẫn chiếu.
            hit = self.hit_from_chunk(row["id"])
            if hit is not None:
                extra.append(hit)
                have.add(row["id"])
        return hits + extra

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


_LABEL_LINE_RE = re.compile(r"^\[([^\]]{1,120})\]")


def _is_continuation(line: str) -> bool:
    return bool(re.match(r"^\[[^\]]{1,120}\][^\n]{0,40}\(tiếp\)", line.strip()))


_REF_RE = re.compile(r"\bmuc\s+(\d+(?:\.\d+)+)\b")
_SECTION_NO_RE = re.compile(r"^(\d+(?:\.\d+)+)\.?(?:\s|$)")


def _section_number(heading: str) -> str:
    m = _SECTION_NO_RE.match((heading or "").strip())
    return m.group(1) if m else ""


def section_text(hit: Hit, max_chunks: int = 10) -> str:
    """Toàn bộ mục đánh số chứa đoạn này (các đoạn liền nhau cùng tiêu đề mục).

    Trình tự thao tác của một mục (VD 9.2.6, 40 bước) bị cắt thành nhiều đoạn
    chỉ mục, truy hồi thường chỉ trúng vài đoạn giữa. Hỏi "các bước" mà chỉ đưa
    mấy đoạn đó thì câu trả lời thiếu bước đầu, bước cuối. Chỉ áp dụng cho mục
    có số (9.2.6...) — mục không số như "Xử lý sự cố" có thể dài cả chục trang.
    """
    if not _section_number(hit.heading):
        return _with_unfinished_sentence(hit, complete_record(hit))
    row = query_one("SELECT ord FROM chunks WHERE id = ?", (hit.chunk_id,))
    if row is None:
        return hit.text
    rows = query(
        "SELECT ord, heading, text FROM chunks WHERE document_id = ? AND ord BETWEEN ? AND ? ORDER BY ord",
        (hit.document_id, row["ord"] - max_chunks, row["ord"] + max_chunks),
    )
    by_ord = {r["ord"]: r for r in rows}
    lo = hi = row["ord"]
    while lo - 1 in by_ord and by_ord[lo - 1]["heading"] == hit.heading and hi - lo + 1 < max_chunks:
        lo -= 1
    while hi + 1 in by_ord and by_ord[hi + 1]["heading"] == hit.heading and hi - lo + 1 < max_chunks:
        hi += 1
    if lo == hi:
        return hit.text
    return "\n".join(by_ord[o]["text"] for o in range(lo, hi + 1))


_SENTENCE_END_RE = re.compile(r"[.:;!?)”\"…]\s*$")


def _with_unfinished_sentence(hit: Hit, text: str) -> str:
    """Đoạn dừng giữa câu (PDF sang trang giữa ô bảng: "...cô lập MCĐC theo" /
    trang sau: "các bước như mục 9.2.7...") thì nối thêm đoạn kế tiếp."""
    if _SENTENCE_END_RE.search(text):
        return text
    row = query_one(
        "SELECT n.text FROM chunks c JOIN chunks n ON n.document_id = c.document_id AND n.ord = c.ord + 1 "
        "WHERE c.id = ?", (hit.chunk_id,))
    return f"{text}\n{row['text']}" if row else text


def complete_record(hit: Hit, span: int = 2) -> str:
    """Nội dung đoạn kèm phần còn lại của các bản ghi bị tách sang đoạn bên cạnh.

    Bản ghi xử lý sự cố dài thường bị cắt làm hai đoạn chỉ mục. Truy hồi trúng
    nửa đầu mà mô hình chỉ đọc nửa đầu thì câu trả lời thiếu các bước cuối —
    mà các bước cuối (báo cáo điều độ, cô lập thiết bị) lại là phần bắt buộc.
    """
    labels: set[str] = set()
    split_labels: set[str] = set()  # nhãn có mảnh "(tiếp)" ngay trong đoạn này
    for line in hit.text.split("\n"):
        if m := _LABEL_LINE_RE.match(line.strip()):
            labels.add(m.group(1))
            if _is_continuation(line):
                split_labels.add(m.group(1))
    if not labels:
        return hit.text
    row = query_one("SELECT ord FROM chunks WHERE id = ?", (hit.chunk_id,))
    if row is None:
        return hit.text
    neighbours = query(
        "SELECT ord, text FROM chunks WHERE document_id = ? AND ord BETWEEN ? AND ? "
        " AND id <> ? ORDER BY ord",
        (hit.document_id, row["ord"] - span, row["ord"] + span, hit.chunk_id),
    )
    have = set(hit.text.split("\n"))
    before, after = [], []
    for other in neighbours:
        for line in other["text"].split("\n"):
            m = _LABEL_LINE_RE.match(line.strip())
            if not m or line in have:
                continue
            # Chỉ ghép mảnh của cùng một bản ghi bị tách. Các dòng khác cùng
            # nhãn (hàng loạt thông số chung một bảng) là bản ghi riêng, kéo
            # vào chỉ làm phình ngữ cảnh.
            label = m.group(1)
            if (label in labels and _is_continuation(line)) or label in split_labels:
                (before if other["ord"] < row["ord"] else after).append(line)
                have.add(line)
    return "\n".join(before + [hit.text] + after)


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


# Số hiệu thiết bị trong câu hỏi: 901, MC273, H1, T2, 231-3... Số thuần phải
# có từ 3 chữ số (bỏ "10 phút", "cấp 2"); có chữ cái thì từ 2 ký tự.
_IDENT_RE = re.compile(r"(?<![0-9a-z])[a-z]{0,4}\d+[a-z0-9]*(?:[-.]\d+[a-z]?)*(?![0-9a-z])")

# Hệ số điểm sau hợp nhất: đoạn nêu đúng số hiệu được hỏi được ưu tiên; đoạn chỉ
# nêu số hiệu "anh em" (902 khi hỏi 901) bị đẩy xuống.
MATCH_BOOST = 1.1
HEADING_BOOST = 1.2
SIBLING_PENALTY = 0.4
# Đoạn có dòng tên sự cố / tên mục khớp gần trọn câu hỏi ("Áp lực dầu cao
# (> 185 Bar)" khi hỏi "xử lý ... khi áp lực dầu cao").
TITLE_BOOST = 1.35
# Câu hỏi gọi đúng tên hệ thống/thiết bị của một tài liệu ("van đĩa", "máy cắt
# đầu cực"): ưu tiên các đoạn của tài liệu đó hơn đoạn cùng chủ đề ở tài liệu khác.
DOC_BOOST = 1.3
# Âm tiết của phần "khung" trong tên quy trình (Quy trình VH&XLSC hệ thống ...).
_TITLE_FILLER = {"quy", "trinh", "vh", "xlsc", "bdsc", "he", "thong", "hhc", "qt", "hua", "na",
                 "thuy", "dien", "cong", "ty"}
# Cặp từ có trong tên hầu hết quy trình — không phân biệt được tài liệu nào.
_GENERIC_PAIRS = {
    "quy_trinh", "trinh_van", "van_hanh", "hanh_va", "va_xu", "xu_ly", "ly_su", "su_co",
    "nha_may", "may_thuy", "thuy_dien", "dien_hua", "hua_na", "he_thong", "huong_dan",
    "tai_lieu", "ky_thuat", "bao_duong", "duong_sua", "sua_chua", "cong_ty", "co_phan",
}


def identifiers(text: str) -> set[str]:
    found = set()
    for m in _IDENT_RE.finditer(normalize(text)):
        ident = m.group(0)
        if ident.isdigit() and len(ident) < 3:
            continue
        if len(ident) < 2:
            continue
        found.add(ident)
    return found


def _siblings(a: str, b: str) -> bool:
    """Hai số hiệu cùng loại, chỉ khác chữ số cuối: 901/902, H1/H2, MC273/MC274,
    231-3/231-1. Không coi 110kV/220kV hay 87T/87G là anh em (phần cuối không
    phải chữ số; mã bảo vệ đã có bảng tên gọi riêng)."""
    return (a != b and len(a) == len(b) and a[:-1] == b[:-1]
            and a[-1].isdigit() and b[-1].isdigit())


def _word_bigrams(text: str) -> set[str]:
    """Cặp âm tiết liền nhau, chỉ gồm chữ (bỏ số: "185 bar" không phải tên sự cố)."""
    syls = [w for w in re.findall(r"[a-z]+|\d+", normalize(text))]
    return {f"{a}_{b}" for a, b in zip(syls, syls[1:]) if a.isalpha() and b.isalpha()}


_TITLE_LINE_RE = re.compile(r"^(?:[—\-•]\s*|\d{1,2}[.)]\s*|\[)?([^\n\]]{6,90})")


_GENERIC_WORDS = {"xu", "ly", "su", "co", "cac", "buoc", "thao", "tac", "khi", "va", "cua", "trong", "thi"}


def _has_matching_title(info: dict, wanted: set[str], wanted_words: set[str]) -> bool:
    """Đoạn có dòng ngắn (tên sự cố trong bảng, nhãn bản ghi, tiêu đề mục) mà
    gần như mọi cặp từ của nó đều có trong câu hỏi.

    Bảng xử lý sự cố chung cho cả hai tổ máy không ghi "H1", "H2"; hỏi "van đĩa
    H1 khi áp lực dầu cao" thì đoạn trúng tên sự cố "Áp lực dầu cao (> 185 Bar)"
    phải thắng các đoạn chỉ có chữ "van đĩa H1".
    """
    lines = [info.get("heading", "")] + info.get("text", "").split("\n")[:80]
    for line in lines:
        m = _TITLE_LINE_RE.match(line.strip())
        if not m or len(line) > 110:
            continue
        title = m.group(1)
        pairs = _word_bigrams(title)
        if len(pairs) >= 3 and len(pairs & wanted) >= 0.8 * len(pairs):
            return True
        # Hỏi "áp lực dầu ... tăng cao" vẫn khớp tên "Áp lực dầu cao": mọi âm tiết
        # của tên có trong câu hỏi, và tên không chỉ toàn từ chung chung.
        # Bỏ phần trong ngoặc (ngưỡng, đơn vị: "(> 185 Bar)") trước khi so.
        words = set(re.findall(r"[a-z]+", normalize(re.sub(r"\([^)]*\)?", " ", title))))
        if len(words) >= 3 and words <= wanted_words and words - _GENERIC_WORDS:
            return True
    return False


def _prefer_asked_identifiers(fused: list[tuple[int, float]], question: str,
                              meta: dict[int, dict]) -> list[tuple[int, float]]:
    """Hỏi máy cắt 901 thì đoạn về 901 phải đứng trước đoạn về 902.

    Quy trình hay có các mục gần như giống hệt nhau cho từng thiết bị cùng loại
    (máy cắt 901/902, tổ máy H1/H2). Cả từ khoá lẫn vector ngữ nghĩa đều coi hai
    mục đó gần như một, và chỉ cần cách hỏi trùng chữ với mục 902 hơn một chút
    là mục 902 lên đầu — trả lời sai thiết bị. Ở đây đoạn nêu đúng số hiệu được
    hỏi được cộng điểm; đoạn chỉ nêu số hiệu khác cùng loại (mà không nêu số
    hiệu được hỏi) bị trừ điểm. Đoạn không nêu số hiệu nào giữ nguyên.
    """
    asked = identifiers(question)
    wanted = _word_bigrams(question)
    if not fused:
        return fused
    distinctive = wanted - _GENERIC_PAIRS
    wanted_words = set(re.findall(r"[a-z]+", normalize(question)))
    doc_hit: dict[int, bool] = {}
    rescored = []
    for chunk_id, score in fused:
        info = meta.get(chunk_id) or {}
        doc_id = info.get("document_id")
        if doc_id not in doc_hit:
            # Khớp từ 2 cụm ("máy cắt", "cắt đầu", "đầu cực") hoặc nửa tên riêng
            # của tài liệu ("van đĩa" trong "hệ thống van đĩa"). Một cụm chung
            # như "máy phát" có trong tên nhiều quy trình thì chưa đủ.
            own = {pair for pair in _word_bigrams(info.get("title", "")) - _GENERIC_PAIRS
                   if not set(pair.split("_")) & _TITLE_FILLER}
            common = len(distinctive & own)
            doc_hit[doc_id] = common >= 2 or (common >= 1 and common * 2 >= len(own))
        if doc_hit[doc_id]:
            score *= DOC_BOOST
        if wanted and _has_matching_title(info, wanted, wanted_words):
            score *= TITLE_BOOST
        if not asked:
            rescored.append((chunk_id, score))
            continue
        in_heading = identifiers(info.get("heading", ""))
        present = in_heading | identifiers(info.get("text", ""))
        if asked & in_heading:
            # Mục riêng của đúng thiết bị được hỏi (tiêu đề mục nêu số hiệu).
            score *= HEADING_BOOST
        elif asked & present:
            score *= MATCH_BOOST
        elif any(_siblings(a, p) for a in asked for p in present):
            score *= SIBLING_PENALTY
        rescored.append((chunk_id, score))
    rescored.sort(key=lambda x: x[1], reverse=True)
    return rescored


def _reciprocal_rank_fusion(*rankings: list[tuple[int, float]]) -> list[tuple[int, float]]:
    """Hợp nhất nhiều bảng xếp hạng bằng RRF — không cần chuẩn hoá thang điểm."""
    combined: Counter = Counter()
    for ranking in rankings:
        for rank, (chunk_id, _) in enumerate(ranking, start=1):
            combined[chunk_id] += 1.0 / (RRF_K + rank)
    return combined.most_common()


index = HybridIndex()
