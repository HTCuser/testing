"""Nạp nội dung vào chỉ mục: tệp tải lên và bản ghi nghiệp vụ."""
from __future__ import annotations

from pathlib import Path

from .. import config
from ..docview import warm as warm_view
from ..db import execute, query, query_one, tx
from . import embeddings
from .chunking import chunk_text
from .extract import extract
from .index import index


def index_file(document_id: int, path: Path, *, embed: bool = True) -> tuple[int, int]:
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

    _replace_chunks(document_id, [(c.ord, c.page, c.heading, c.text) for c in chunks], embed=embed)
    warm_view(path)
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


def _replace_chunks(document_id: int, rows: list[tuple], *, embed: bool = True) -> None:
    with tx() as conn:
        conn.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
        conn.executemany(
            "INSERT INTO chunks (document_id, ord, page, heading, text) VALUES (?, ?, ?, ?, ?)",
            [(document_id, *row) for row in rows],
        )
    if embed:
        _embed_document(document_id)
    index.rebuild()


def reextract_all_files() -> dict:
    """Đọc lại toàn bộ tệp đã tải lên và cắt đoạn lại từ đầu.

    Cách trích xuất và cắt đoạn còn được cải tiến (bảng thông số, trang ký duyệt,
    ranh giới đoạn), nhưng nội dung đã cắt nằm sẵn trong CSDL nên chỉ dựng lại
    chỉ mục thì thư viện cũ vẫn giữ nguyên cách cắt cũ. Không đọc lại tệp thì
    người dùng phải xoá và tải lên lại từng tài liệu sau mỗi lần nâng cấp.
    """
    rows = query(
        "SELECT id, stored_name FROM documents "
        " WHERE source_kind = 'tep' AND stored_name <> '' ORDER BY id"
    )
    done = failed = 0
    for row in rows:
        path = config.UPLOAD_DIR / row["stored_name"]
        if not path.exists():
            failed += 1
            continue
        try:
            n_chars, n_chunks = index_file(row["id"], path, embed=False)
        except Exception as exc:
            failed += 1
            execute("UPDATE documents SET index_status = 'loi', index_error = ? WHERE id = ?",
                    (str(exc), row["id"]))
            continue
        execute(
            """UPDATE documents SET n_chars = ?, n_chunks = ?, index_status = 'da_lap_chi_muc',
                      index_error = '' WHERE id = ?""",
            (n_chars, n_chunks, row["id"]),
        )
        done += 1
    return {"reextracted_files": done, "failed_files": failed}


def embed_all_documents() -> dict:
    """Sinh vector cho toàn bộ tài liệu đã có trong thư viện.

    Cần thiết khi bật embedding trên thư viện đã nạp từ trước: lúc nạp tài liệu
    embedding còn tắt nên không có vector nào, và dựng lại chỉ mục chỉ dựng lại
    nhánh BM25.
    """
    if not config.embeddings_enabled():
        return {"embedded_documents": 0, "vectors": 0, "reason": "Chưa bật embedding."}
    rows = query("SELECT DISTINCT document_id FROM chunks")
    for row in rows:
        _embed_document(row["document_id"])
    total = query_one("SELECT COUNT(*) AS n FROM embeddings")
    return {
        "embedded_documents": len(rows),
        "vectors": total["n"] if total else 0,
        "reason": "",
    }


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
    conditions = form.get("conditions") or []
    if conditions:
        lines.append("\n## Điều kiện cần có để thực hiện")
        lines.extend(f"{i}. {item}" for i, item in enumerate(conditions, start=1))
    rows = form.get("rows") or []
    if rows:
        lines.append("\n## Trình tự hạng mục thao tác")
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
    "kinh_nghiem": "Thực tế vận hành tại Hủa Na",
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


# Nhãn từng trường của nhật ký nghiệp vụ, theo loại. Dùng chung cho bản kết
# xuất lập chỉ mục (để trợ lý đọc hiểu) và cho API trả về giao diện.
JOURNAL_LABELS = {
    "thao_tac": {
        "_name": "Thao tác vận hành",
        "ref": "Số phiếu thao tác",
        "leader": "Người ra lệnh",
        "performers": "Người thực hiện",
        "details": "Diễn biến thao tác",
        "materials": "",
        "result": "Kết quả, trạng thái thiết bị sau thao tác",
        "notes": "Bất thường phát sinh, lưu ý, kinh nghiệm",
    },
    "bao_duong": {
        "_name": "Bảo dưỡng, sửa chữa",
        "ref": "Số phiếu công tác / lệnh công tác",
        "leader": "Người chỉ huy trực tiếp",
        "performers": "Đơn vị, người thực hiện",
        "details": "Nội dung công việc",
        "materials": "Vật tư, thiết bị thay thế",
        "result": "Kết quả, tình trạng thiết bị sau sửa chữa",
        "notes": "Hư hỏng phát hiện, lưu ý, kinh nghiệm",
    },
}


def _vi_datetime(value: str) -> str:
    """"2026-09-26T08:30" → "08:30 ngày 26/09/2026"."""
    if not value:
        return ""
    day, _, time = value.partition("T")
    parts = day.split("-")
    if len(parts) != 3:
        return value
    text = f"ngày {parts[2]}/{parts[1]}/{parts[0]}"
    return f"{time[:5]} {text}" if time else text


def render_journal(entry: dict, equipment_name: str = "") -> str:
    labels = JOURNAL_LABELS[entry["kind"]]
    lines = [f"# {labels['_name']}: {entry['title']}"]
    when = _vi_datetime(entry.get("started_at", ""))
    if entry.get("finished_at"):
        when = f"{when} đến {_vi_datetime(entry['finished_at'])}"
    if when:
        lines.append(f"Thời gian: {when}")
    if entry.get("shift"):
        lines.append(f"Ca, kíp: {entry['shift']}")
    if equipment_name:
        lines.append(f"Thiết bị: {equipment_name}")
    for key in ("ref", "leader", "performers"):
        if entry.get(key):
            lines.append(f"{labels[key]}: {entry[key]}")
    for key in ("details", "materials", "result", "notes"):
        if entry.get(key) and labels[key]:
            lines.append(f"\n## {labels[key]}\n{entry[key]}")
    return "\n".join(lines)
