from __future__ import annotations

import re
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse

from ..config import ALLOWED_EXTENSIONS, MAX_UPLOAD_MB, UPLOAD_DIR
from .. import auth, docview
from ..db import execute, query, query_one, rows_to_dicts
from ..models import DocumentUpdate
from ..rag.index import index
from ..rag.indexer import index_file
from ..rag.textutils import normalize, strip_accents

router = APIRouter(prefix="/api/documents", tags=["Thư viện kỹ thuật"])

CATEGORIES = {
    "tai_lieu_ky_thuat": "Tài liệu kỹ thuật thiết bị",
    "quy_trinh_van_hanh": "Quy trình vận hành và xử lý sự cố",
    "quy_trinh_bao_duong": "Quy trình bảo dưỡng, sửa chữa",
    "quy_trinh_su_co": "Quy trình xử lý sự cố",
    "so_do_ban_ve": "Sơ đồ, bản vẽ",
    "bai_hoc_kinh_nghiem": "Bài học kinh nghiệm",
    "bieu_mau": "Biểu mẫu, phiếu",
    "khac": "Khác",
}


@router.get("/categories")
def categories() -> dict:
    return {"items": [{"value": k, "label": v} for k, v in CATEGORIES.items()]}


@router.get("")
def list_documents(q: str = "", category: str = "", equipment_id: int | None = None,
                   source_kind: str = "", categories: str = "") -> dict:
    rows = query(
        """
        SELECT d.*, COALESCE(e.name, '') AS equipment_name, COALESCE(e.code, '') AS equipment_code
          FROM documents d
     LEFT JOIN equipment e ON e.id = d.equipment_id
         ORDER BY d.created_at DESC, d.id DESC
        """
    )
    items = rows_to_dicts(rows)
    if category:
        items = [it for it in items if it["category"] == category]
    if categories:
        # Mỗi trang thư viện (quy trình VH&XLSC, quy trình BD-SC, tài liệu kỹ
        # thuật) là một nhóm phân loại.
        wanted = {c.strip() for c in categories.split(",") if c.strip()}
        items = [it for it in items if it["category"] in wanted]
    if source_kind:
        items = [it for it in items if it["source_kind"] == source_kind]
    if equipment_id:
        items = [it for it in items if it["equipment_id"] == equipment_id]
    if q:
        needle = normalize(q)
        items = [
            it for it in items
            if needle in normalize(f"{it['title']} {it['doc_code']} {it['decision_no']} {it['tags']} "
                                   f"{it['description']} {it['equipment_name']}")
        ]
    for item in items:
        item["category_label"] = CATEGORIES.get(item["category"], item["category"])
    return {"items": items, "total": len(items)}


@router.get("/{document_id}")
def get_document(document_id: int) -> dict:
    row = query_one(
        """SELECT d.*, COALESCE(e.name, '') AS equipment_name
             FROM documents d LEFT JOIN equipment e ON e.id = d.equipment_id
            WHERE d.id = ?""",
        (document_id,),
    )
    if row is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    item = dict(row)
    item["category_label"] = CATEGORIES.get(item["category"], item["category"])
    # Không trả về toàn bộ đoạn chỉ mục nữa: đó là dữ liệu phục vụ truy hồi, đọc
    # trực tiếp thì rời rạc và khó hiểu. Người dùng mở tệp gốc để đọc, và dùng
    # /search để tìm trong tài liệu.
    return item


@router.get("/{document_id}/search")
def search_in_document(document_id: int, q: str = "", top_k: int = 10) -> dict:
    if query_one("SELECT id FROM documents WHERE id = ?", (document_id,)) is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    if not q.strip():
        return {"items": [], "total": 0}
    hits = index.search(q, top_k=min(top_k, 30), document_id=document_id)
    return {
        "items": [
            {
                "n": i,
                "page": h.page,
                "heading": h.heading,
                "excerpt": h.excerpt,
                "text": h.text,
                "score": h.score,
            }
            for i, h in enumerate(hits, start=1)
        ],
        "total": len(hits),
    }


@router.get("/{document_id}/text", response_class=PlainTextResponse)
def get_document_text(document_id: int) -> str:
    rows = query("SELECT text FROM chunks WHERE document_id = ? ORDER BY ord", (document_id,))
    if not rows:
        raise HTTPException(404, "Tài liệu chưa có nội dung đã lập chỉ mục")
    return "\n\n".join(r["text"] for r in rows)


@router.get("/{document_id}/xem", response_class=HTMLResponse)
def view_document(document_id: int):
    """Mở tài liệu ngay trên trình duyệt, không phải tải về."""
    row = query_one(
        "SELECT title, filename, stored_name, category FROM documents WHERE id = ?",
        (document_id,),
    )
    if row is None or not row["stored_name"]:
        raise HTTPException(404, "Tài liệu này không có tệp đính kèm")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Tệp không còn tồn tại trên máy chủ")

    if not docview.needs_conversion(path):
        # PDF và văn bản thuần: để trình duyệt tự dựng, giữ nguyên bản gốc.
        return RedirectResponse(f"/api/documents/{document_id}/file", status_code=307)

    try:
        body = docview.render_body_cached(path)
    except Exception as exc:
        raise HTTPException(422, f"Không dựng được bản xem: {exc}")

    meta = " · ".join(
        part for part in (CATEGORIES.get(row["category"], ""), row["filename"]) if part
    )
    return HTMLResponse(docview.page(
        row["title"] or row["filename"],
        meta,
        body,
        f"/api/documents/{document_id}/file?tai_ve=true",
    ))


# Định dạng trình duyệt hiển thị được ngay, không cần tải về mở bằng ứng dụng khác.
INLINE_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
}


@router.get("/{document_id}/file")
def download_document(document_id: int, tai_ve: bool = False):
    row = query_one("SELECT filename, stored_name FROM documents WHERE id = ?", (document_id,))
    if row is None or not row["stored_name"]:
        raise HTTPException(404, "Tài liệu này không có tệp đính kèm")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Tệp không còn tồn tại trên máy chủ")

    media_type = INLINE_TYPES.get(path.suffix.lower())
    if media_type and not tai_ve:
        # Mở thẳng trong trình duyệt. Tên tệp đặt trong header riêng vì tham số
        # filename của FileResponse luôn ép thành tải về.
        return FileResponse(
            path,
            media_type=media_type,
            headers={
                "Content-Disposition":
                    f'inline; filename*=UTF-8\'\'{quote(row["filename"])}'
            },
        )
    return FileResponse(path, filename=row["filename"])


@router.post("", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    category: str = Form("tai_lieu_ky_thuat"),
    equipment_id: str = Form(""),
    tags: str = Form(""),
    version: str = Form(""),
    issued_date: str = Form(""),
    description: str = Form(""),
    uploaded_by: str = Form(""),
    doc_code: str = Form(""),
    decision_no: str = Form(""),
) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            415, f"Chỉ hỗ trợ định dạng: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Tệp vượt quá giới hạn {MAX_UPLOAD_MB} MB")

    stored_name = f"{uuid.uuid4().hex}{suffix}"
    path = UPLOAD_DIR / stored_name
    path.write_bytes(payload)

    eq_id = int(equipment_id) if equipment_id.strip().isdigit() else None
    document_id = execute(
        """INSERT INTO documents (title, filename, stored_name, mime, size_bytes, category,
                                  equipment_id, tags, version, issued_date, uploaded_by,
                                  description, doc_code, decision_no, source_kind, index_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tep', 'dang_xu_ly')""",
        (
            title.strip() or Path(file.filename or stored_name).stem,
            file.filename or stored_name, stored_name, file.content_type or "",
            len(payload), category, eq_id, tags, version, issued_date,
            uploaded_by or auth.display_name(), description,
            doc_code.strip(), decision_no.strip(),
        ),
    )

    try:
        n_chars, n_chunks = index_file(document_id, path)
    except Exception as exc:
        execute(
            "UPDATE documents SET index_status = 'loi', index_error = ? WHERE id = ?",
            (str(exc), document_id),
        )
        return get_document(document_id)

    execute(
        """UPDATE documents SET n_chars = ?, n_chunks = ?, index_status = 'da_lap_chi_muc',
                  index_error = '' WHERE id = ?""",
        (n_chars, n_chunks, document_id),
    )
    filled = _autofill_issuance(document_id)
    auth.note(query_one("SELECT title FROM documents WHERE id = ?", (document_id,))["title"])
    return {**get_document(document_id), "auto_filled": filled}


# ------------------------------------------------------------------ thông tin ban hành

_ISSUANCE_LABELS = {"doc_code": "mã hiệu", "decision_no": "số quyết định", "issued_date": "ngày ban hành"}


def _iso(day: str, month: str, year: str) -> str:
    try:
        d, m, y = int(day), int(month), int(year)
    except ValueError:
        return ""
    return f"{y:04d}-{m:02d}-{d:02d}" if 1 <= d <= 31 and 1 <= m <= 12 and 1990 <= y <= 2100 else ""


def detect_issuance(text: str) -> dict:
    """Đọc mã hiệu, số quyết định, ngày ban hành ở trang bìa quy trình.

    Trang bìa quy trình của nhà máy ghi theo mẫu:
        MÃ HIỆU: HHC-VH-QT-20      NGÀY HIỆU LỰC: 11/3/2025
        (Ban hành kèm theo Quyết định số: 86/QĐ-HHC ngày 11 tháng 3 năm 2025 ...)
    Chỉ đọc phần đầu tài liệu; so khớp trên bản bỏ dấu để không phụ thuộc dấu,
    hoa thường hay lỗi gõ dấu.
    """
    plain = strip_accents(text[:6000])
    found: dict[str, str] = {}
    for m in re.finditer(r"\bMA\s*HIEU\s*[:：]?\s*([A-Z0-9][A-Z0-9.\-/_]*[A-Z0-9])", plain, re.I):
        # Mã hiệu thật có số hoặc gạch nối; bỏ qua "mã hiệu thiết bị..." trong thân bài.
        if len(m.group(1)) >= 4 and re.search(r"[\d\-]", m.group(1)):
            found["doc_code"] = m.group(1).upper()
            break
    m = re.search(r"Quyet\s+dinh\s+so\s*[:：]?\s*(\d{1,5})\s*/\s*(QD\s*[-–]?\s*[A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)*)",
                  plain, re.I)
    if m:
        suffix = re.sub(r"\s+", "", m.group(2)).upper().replace("–", "-")
        found["decision_no"] = f"{m.group(1)}/QĐ{suffix[2:]}"
        near = plain[m.end():m.end() + 80]
        d = re.search(r"ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})", near, re.I)
        if d and _iso(*d.groups()):
            found["issued_date"] = _iso(*d.groups())
    m = re.search(r"HIEU\s+LUC\s*[:：]?\s*(?:(?:tu|ke\s+tu)\s+ngay\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})",
                  plain, re.I)
    if m and _iso(*m.groups()) and "issued_date" not in found:
        # Ngày trong dòng quyết định viết tay trên bản scan hay đọc sai; khi đó
        # lấy ngày hiệu lực in trên bìa (thường trùng ngày ban hành).
        found["issued_date"] = _iso(*m.groups())
    return found


def _autofill_issuance(document_id: int) -> list[str]:
    """Điền các ô ban hành còn trống từ nội dung tệp. Trả về tên các ô đã điền."""
    doc = query_one("SELECT * FROM documents WHERE id = ?", (document_id,))
    text = "\n".join(r["text"] for r in query(
        "SELECT text FROM chunks WHERE document_id = ? ORDER BY ord LIMIT 8", (document_id,)))
    found = {k: v for k, v in detect_issuance(text).items() if not (doc[k] or "").strip()}
    if found:
        execute(f"UPDATE documents SET {', '.join(f'{k} = ?' for k in found)} WHERE id = ?",
                (*found.values(), document_id))
        index.rebuild()
    return [_ISSUANCE_LABELS[k] for k in found]


@router.put("/{document_id}")
def update_document(document_id: int, payload: DocumentUpdate) -> dict:
    if query_one("SELECT id FROM documents WHERE id = ?", (document_id,)) is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    # exclude_unset: gửi equipment_id = null là bỏ gắn thiết bị; ô không gửi thì giữ nguyên.
    fields = payload.model_dump(exclude_unset=True)
    fields = {k: (v.strip() if isinstance(v, str) else v) for k, v in fields.items()
              if v is not None or k == "equipment_id"}
    if "category" in fields and fields["category"] not in CATEGORIES:
        raise HTTPException(400, "Phân loại không hợp lệ")
    if "title" in fields and not fields["title"]:
        raise HTTPException(400, "Tên tài liệu không được để trống")
    if fields:
        assignments = ", ".join(f"{k} = ?" for k in fields)
        execute(f"UPDATE documents SET {assignments} WHERE id = ?",
                (*fields.values(), document_id))
        index.rebuild()
    return get_document(document_id)


@router.post("/{document_id}/reindex")
def reindex_document(document_id: int) -> dict:
    row = query_one("SELECT stored_name, source_kind FROM documents WHERE id = ?", (document_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    if row["source_kind"] != "tep" or not row["stored_name"]:
        raise HTTPException(400, "Tài liệu này được sinh từ bản ghi nghiệp vụ, không cần nạp lại")
    path = UPLOAD_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Tệp không còn tồn tại trên máy chủ")
    try:
        n_chars, n_chunks = index_file(document_id, path)
    except Exception as exc:
        execute("UPDATE documents SET index_status = 'loi', index_error = ? WHERE id = ?",
                (str(exc), document_id))
        raise HTTPException(422, f"Không nạp được tài liệu: {exc}")
    execute(
        """UPDATE documents SET n_chars = ?, n_chunks = ?, index_status = 'da_lap_chi_muc',
                  index_error = '' WHERE id = ?""",
        (n_chars, n_chunks, document_id),
    )
    filled = _autofill_issuance(document_id)
    return {**get_document(document_id), "auto_filled": filled}


@router.post("/{document_id}/tep")
async def replace_file(document_id: int, file: UploadFile = File(...)) -> dict:
    """Thay tệp bằng bản mới (quy trình sửa đổi, bản scan rõ hơn...). Giữ nguyên
    mục trong thư viện và các thông tin đã nhập; nội dung tra cứu đọc lại từ tệp mới."""
    row = query_one("SELECT stored_name, source_kind FROM documents WHERE id = ?", (document_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    if row["source_kind"] != "tep":
        raise HTTPException(400, "Tài liệu này sinh từ bản ghi nghiệp vụ, không có tệp để thay")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"Chỉ hỗ trợ định dạng: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    payload = await file.read()
    if len(payload) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Tệp vượt quá giới hạn {MAX_UPLOAD_MB} MB")
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    path = UPLOAD_DIR / stored_name
    path.write_bytes(payload)
    try:
        n_chars, n_chunks = index_file(document_id, path)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(422, f"Không đọc được tệp mới, giữ nguyên tệp cũ: {exc}")
    execute(
        """UPDATE documents SET filename = ?, stored_name = ?, mime = ?, size_bytes = ?, n_chars = ?,
                  n_chunks = ?, index_status = 'da_lap_chi_muc', index_error = '' WHERE id = ?""",
        (file.filename or stored_name, stored_name, file.content_type or "", len(payload),
         n_chars, n_chunks, document_id),
    )
    if row["stored_name"] and row["stored_name"] != stored_name:
        (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
    filled = _autofill_issuance(document_id)
    return {**get_document(document_id), "auto_filled": filled}


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int) -> None:
    row = query_one("SELECT stored_name, source_kind FROM documents WHERE id = ?", (document_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy tài liệu")
    if row["source_kind"] != "tep":
        raise HTTPException(
            400, "Tài liệu này sinh từ bản ghi nghiệp vụ. Hãy xoá bản ghi gốc tương ứng."
        )
    if row["stored_name"]:
        (UPLOAD_DIR / row["stored_name"]).unlink(missing_ok=True)
    execute("DELETE FROM documents WHERE id = ?", (document_id,))
    index.rebuild()
