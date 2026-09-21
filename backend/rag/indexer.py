"""Nạp nội dung vào chỉ mục: tệp tải lên và bản ghi nghiệp vụ."""
from __future__ import annotations

from pathlib import Path

from .. import config
from ..db import execute, query, query_one, tx
from . import embeddings
from .chunking import chunk_text
from .extract import extract
from .index import index


def index_file(document_id: int, path: Path) -> tuple[int, int]:
    """Trích xuất, cắt đoạn và lập chỉ mục một tệp. Trả về (số ký tự, số chunk)."""
    sections = extract(path)
    chunks = []
    order = 0
    n_chars = 0
    for page, text in sections:
        n_chars += len(text)
        page_chunks = chunk_text(text, page=page, start_ord=order)
        chunks.extend(page_chunks)
        order += len(page_chunks)

    _replace_chunks(document_id, [(c.ord, c.page, c.heading, c.text) for c in chunks])
    return n_chars, len(chunks)


def index_record(kind: str, record_id: int, *, title: str, category: str,
                 equipment_id: int | None, text: str) -> int:
    """Ánh xạ một bản ghi nghiệp vụ thành tài liệu ảo và lập chỉ mục cho nó."""
    existing = query_one(
        "SELECT id FROM documents WHERE source_kind = ? AND source_id = ?", (kind, record_id)
    )
    chunks = chunk_text(text)
    if existing:
        document_id = existing["id"]
        execute(
            """UPDATE documents SET title = ?, category = ?, equipment_id = ?,
                      n_chars = ?, n_chunks = ?, index_status = 'da_lap_chi_muc', index_error = ''
                WHERE id = ?""",
            (title, category, equipment_id, len(text), len(chunks), document_id),
        )
    else:
        document_id = execute(
            """INSERT INTO documents (title, category, equipment_id, source_kind, source_id,
                                      n_chars, n_chunks, index_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'da_lap_chi_muc')""",
            (title, category, equipment_id, kind, record_id, len(text), len(chunks)),
        )

    _replace_chunks(document_id, [(c.ord, c.page, c.heading, c.text) for c in chunks])
    return document_id


def remove_record(kind: str, record_id: int) -> None:
    execute("DELETE FROM documents WHERE source_kind = ? AND source_id = ?", (kind, record_id))
    index.rebuild()


def _replace_chunks(document_id: int, rows: list[tuple]) -> None:
    with tx() as conn:
        conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
        conn.executemany(
            "INSERT INTO chunks (document_id, ord, page, heading, text) VALUES (?, ?, ?, ?, ?)",
            [(document_id, *row) for row in rows],
        )
    _embed_document(document_id)
    index.rebuild()


def _embed_document(document_id: int) -> None:
    if not config.embeddings_enabled():
        return
    rows = query("SELECT id, text FROM chunks WHERE document_id = ? ORDER BY ord", (document_id,))
    if not rows:
        return
    model = embeddings.model_name()
    batch_size = 64
    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]
        try:
            vectors = embeddings.embed([r["text"] for r in batch])
        except Exception:
            # Embedding là nhánh bổ trợ; hỏng thì vẫn còn BM25 phục vụ truy hồi.
            return
        with tx() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO embeddings (chunk_id, model, dim, vector) VALUES (?, ?, ?, ?)",
                [
                    (row["id"], model, len(vec), embeddings.to_blob(vec))
                    for row, vec in zip(batch, vectors)
                ],
            )


# ------------------------------------------------------------- kết xuất bản ghi

def render_procedure(proc: dict, equipment_name: str = "") -> str:
    lines = [f"# {proc['title']}"]
    if proc.get("code"):
        lines.append(f"Mã quy trình: {proc['code']}")
    if equipment_name:
        lines.append(f"Thiết bị: {equipment_name}")
    lines.append(f"Loại: {KIND_LABELS.get(proc.get('kind', ''), proc.get('kind', ''))}")
    if proc.get("summary"):
        lines.append(f"\n## Mục đích\n{proc['summary']}")
    if proc.get("conditions"):
        lines.append(f"\n## Điều kiện áp dụng\n{proc['conditions']}")
    safety = proc.get("safety") or []
    if safety:
        lines.append("\n## Biện pháp an toàn")
        lines.extend(f"- {item}" for item in safety)
    steps = proc.get("steps") or []
    if steps:
        lines.append("\n## Trình tự thực hiện")
        for i, step in enumerate(steps, start=1):
            if isinstance(step, dict):
                text = step.get("text", "")
                note = step.get("note", "")
                lines.append(f"{i}. {text}" + (f" (Lưu ý: {note})" if note else ""))
            else:
                lines.append(f"{i}. {step}")
    if proc.get("source_ref"):
        lines.append(f"\nCăn cứ: {proc['source_ref']}")
    return "\n".join(lines)


def render_incident(inc: dict, equipment_name: str = "") -> str:
    lines = [f"# Sự cố: {inc['title']}"]
    if inc.get("code"):
        lines.append(f"Mã: {inc['code']}")
    if equipment_name:
        lines.append(f"Thiết bị: {equipment_name}")
    lines.append(f"Mức độ: {SEVERITY_LABELS.get(inc.get('severity', ''), inc.get('severity', ''))}")
    lines.append(f"Nguồn: {SOURCE_LABELS.get(inc.get('source', ''), inc.get('source', ''))}")
    for label, key in (
        ("Hiện tượng / dấu hiệu nhận biết", "symptoms"),
        ("Nguyên nhân có thể", "causes"),
        ("Trình tự xử lý", "actions"),
    ):
        items = inc.get(key) or []
        if items:
            lines.append(f"\n## {label}")
            lines.extend(f"- {item}" for item in items)
    if inc.get("prevention"):
        lines.append(f"\n## Biện pháp phòng ngừa\n{inc['prevention']}")
    if inc.get("lesson"):
        lines.append(f"\n## Bài học kinh nghiệm\n{inc['lesson']}")
    if inc.get("source_ref"):
        lines.append(f"\nCăn cứ: {inc['source_ref']}")
    return "\n".join(lines)


def render_form(form: dict, equipment_name: str = "") -> str:
    lines = [f"# {FORM_LABELS.get(form.get('form_type', ''), 'Biểu mẫu')}: {form['title']}"]
    if form.get("code"):
        lines.append(f"Mã biểu mẫu: {form['code']}")
    if form.get("context"):
        lines.append(
            f"Trường hợp áp dụng: {FORM_CONTEXT_LABELS.get(form['context'], form['context'])}"
        )
    if form.get("work_type"):
        lines.append(f"Dạng công tác: {form['work_type']}")
    if equipment_name:
        lines.append(f"Thiết bị: {equipment_name}")
    if form.get("purpose"):
        lines.append(f"\n## Mục đích\n{form['purpose']}")
    if form.get("conditions"):
        lines.append(f"\n## Điều kiện\n{form['conditions']}")
    safety = form.get("safety") or []
    if safety:
        lines.append("\n## Biện pháp an toàn")
        lines.extend(f"- {item}" for item in safety)
    rows = form.get("rows") or []
    if rows:
        lines.append("\n## Nội dung thao tác")
        for i, row in enumerate(rows, start=1):
            action = row.get("action", "") if isinstance(row, dict) else str(row)
            target = row.get("target", "") if isinstance(row, dict) else ""
            note = row.get("note", "") if isinstance(row, dict) else ""
            parts = [p for p in (target, action, note) if p]
            lines.append(f"{i}. " + " — ".join(parts))
    if form.get("notes"):
        lines.append(f"\n## Ghi chú\n{form['notes']}")
    return "\n".join(lines)


KIND_LABELS = {
    "van_hanh": "Quy trình vận hành",
    "bao_duong": "Quy trình bảo dưỡng, sửa chữa",
    "su_co": "Quy trình xử lý sự cố",
}
SEVERITY_LABELS = {
    "nghiem_trong": "Nghiêm trọng",
    "trung_binh": "Trung bình",
    "nhe": "Nhẹ / bất thường",
}
SOURCE_LABELS = {
    "quy_trinh": "Quy trình vận hành và xử lý sự cố nhà máy",
    "kinh_nghiem": "Kinh nghiệm tích luỹ tại Hủa Na",
    "nha_may_khac": "Bài học từ nhà máy điện khác",
}
FORM_LABELS = {
    "co_lap": "Phiếu cô lập",
    "tai_lap": "Phiếu tái lập",
}
FORM_CONTEXT_LABELS = {
    "van_hanh": "Vận hành bình thường",
    "bao_duong": "Bảo dưỡng, sửa chữa",
}
