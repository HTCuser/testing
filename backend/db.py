"""Lớp truy cập SQLite: khởi tạo schema và các hàm tiện ích."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator

from .config import DB_PATH

_local = threading.local()

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS equipment (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    system        TEXT NOT NULL DEFAULT '',
    location      TEXT NOT NULL DEFAULT '',
    manufacturer  TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT '',
    commissioned  TEXT NOT NULL DEFAULT '',
    specs         TEXT NOT NULL DEFAULT '[]',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    filename      TEXT NOT NULL DEFAULT '',
    stored_name   TEXT NOT NULL DEFAULT '',
    mime          TEXT NOT NULL DEFAULT '',
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    category      TEXT NOT NULL DEFAULT 'khac',
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    -- source_kind = 'tep' với tài liệu người dùng tải lên; các giá trị khác là
    -- bản ghi nghiệp vụ (quy trình, sự cố, biểu mẫu) được ánh xạ sang tài liệu
    -- ảo để dùng chung một đường truy hồi và một cơ chế trích dẫn.
    source_kind   TEXT NOT NULL DEFAULT 'tep',
    source_id     INTEGER,
    tags          TEXT NOT NULL DEFAULT '',
    version       TEXT NOT NULL DEFAULT '',
    issued_date   TEXT NOT NULL DEFAULT '',
    uploaded_by   TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    n_chars       INTEGER NOT NULL DEFAULT 0,
    n_chunks      INTEGER NOT NULL DEFAULT 0,
    index_status  TEXT NOT NULL DEFAULT 'cho_xu_ly',
    index_error   TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ord           INTEGER NOT NULL,
    page          INTEGER,
    heading       TEXT NOT NULL DEFAULT '',
    text          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source
    ON documents(source_kind, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id      INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    model         TEXT NOT NULL,
    dim           INTEGER NOT NULL,
    vector        BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS procedures (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'van_hanh',
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    summary       TEXT NOT NULL DEFAULT '',
    conditions    TEXT NOT NULL DEFAULT '',
    safety        TEXT NOT NULL DEFAULT '[]',
    steps         TEXT NOT NULL DEFAULT '[]',
    source_ref    TEXT NOT NULL DEFAULT '',
    document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL,
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    severity      TEXT NOT NULL DEFAULT 'trung_binh',
    source        TEXT NOT NULL DEFAULT 'quy_trinh',
    symptoms      TEXT NOT NULL DEFAULT '[]',
    causes        TEXT NOT NULL DEFAULT '[]',
    actions       TEXT NOT NULL DEFAULT '[]',
    prevention    TEXT NOT NULL DEFAULT '',
    lesson        TEXT NOT NULL DEFAULT '',
    occurred_at   TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',
    source_ref    TEXT NOT NULL DEFAULT '',
    document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forms (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL,
    form_type     TEXT NOT NULL DEFAULT 'co_lap',
    context       TEXT NOT NULL DEFAULT 'bao_duong',
    work_type     TEXT NOT NULL DEFAULT '',
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    requesting_unit TEXT NOT NULL DEFAULT '',
    purpose       TEXT NOT NULL DEFAULT '',
    conditions    TEXT NOT NULL DEFAULT '[]',
    -- safety giữ lại để không xoá dữ liệu đã nhập; phiếu thao tác không dùng
    -- mục này nữa vì biện pháp an toàn thuộc phiếu công tác.
    safety        TEXT NOT NULL DEFAULT '[]',
    rows          TEXT NOT NULL DEFAULT '[]',
    notes         TEXT NOT NULL DEFAULT '',
    attachment    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    question      TEXT NOT NULL,
    answer        TEXT NOT NULL DEFAULT '',
    sources       TEXT NOT NULL DEFAULT '[]',
    mode          TEXT NOT NULL DEFAULT '',
    latency_ms    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Đếm số lượt đã gọi mô hình sinh, tách theo ngày và theo tháng. Đếm riêng ở
-- đây thay vì đếm lại chat_logs để hạn mức không bị reset khi xoá nhật ký và
-- để mỗi lần kiểm tra chỉ đọc một dòng.
-- Mẫu phiếu thao tác: file Word của nhà máy, vận hành viên đánh dấu các ô cần
-- điền bằng {{Tên ô}}. fields lưu danh sách ô đọc được lúc tải lên.
CREATE TABLE IF NOT EXISTS ticket_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    category       TEXT NOT NULL DEFAULT 'khac',
    filename       TEXT NOT NULL DEFAULT '',
    stored_name    TEXT NOT NULL,
    fields         TEXT NOT NULL DEFAULT '[]',
    -- Định dạng số phiếu, "###" là số thứ tự, "YYYY" là năm. Các mẫu cùng
    -- định dạng dùng chung một dãy số, như cùng một quyển sổ phiếu.
    number_format  TEXT NOT NULL DEFAULT '###/YYYY/KH/HHC',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phiếu đã lập. Số phiếu cấp một lần lúc lưu và không bao giờ đổi; phiếu lập
-- sai thì huỷ chứ không xoá, để dãy số không bị hổng.
CREATE TABLE IF NOT EXISTS tickets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   INTEGER NOT NULL REFERENCES ticket_templates(id),
    book          TEXT NOT NULL,
    year          INTEGER NOT NULL,
    number        INTEGER NOT NULL,
    code          TEXT NOT NULL,
    ticket_date   TEXT NOT NULL DEFAULT '',
    field_values  TEXT NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'da_lap',
    note          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (book, year, number)
);
CREATE INDEX IF NOT EXISTS idx_tickets_template ON tickets(template_id);

-- Số tiếp theo của từng sổ phiếu trong từng năm. Đặt tay được, để nối tiếp
-- dãy số đang ghi trên sổ giấy khi bắt đầu dùng phần mềm giữa năm.
CREATE TABLE IF NOT EXISTS ticket_counters (
    book          TEXT NOT NULL,
    year          INTEGER NOT NULL,
    next_number   INTEGER NOT NULL,
    PRIMARY KEY (book, year)
);

-- Nhật ký nghiệp vụ do vận hành viên ghi: các lần thao tác vận hành và các
-- đợt bảo dưỡng, sửa chữa đã thực hiện. Mục đích là tra cứu lại được: lần
-- trước làm việc này thế nào, gặp vướng gì, ai làm.
CREATE TABLE IF NOT EXISTS journal (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,              -- thao_tac | bao_duong
    title         TEXT NOT NULL,
    started_at    TEXT NOT NULL DEFAULT '',   -- YYYY-MM-DDTHH:MM, giờ nhà máy
    finished_at   TEXT NOT NULL DEFAULT '',
    shift         TEXT NOT NULL DEFAULT '',
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    ref           TEXT NOT NULL DEFAULT '',   -- số phiếu thao tác / phiếu công tác
    performers    TEXT NOT NULL DEFAULT '',
    leader        TEXT NOT NULL DEFAULT '',   -- người ra lệnh / chỉ huy trực tiếp
    details       TEXT NOT NULL DEFAULT '',
    materials     TEXT NOT NULL DEFAULT '',
    result        TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_kind_time ON journal(kind, started_at);

CREATE TABLE IF NOT EXISTS ask_usage (
    period_kind   TEXT NOT NULL,
    period_key    TEXT NOT NULL,
    used          INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (period_kind, period_key)
);
"""


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    _migrate_forms(conn)


def _migrate_forms(conn: sqlite3.Connection) -> None:
    """Chuyển bảng forms từ một chiều phân loại sang hai chiều.

    Bản đầu chỉ có form_type ∈ {phieu_thao_tac, phieu_co_lap}. Nay tách thành
    context (vận hành bình thường / bảo dưỡng sửa chữa) và form_type (cô lập /
    tái lập). Phiếu cũ đều phát sinh từ công tác sửa chữa nên nhận context
    'bao_duong'; chiều cô lập/tái lập suy từ work_type vì đó là dấu hiệu duy
    nhất phân biệt được trong dữ liệu cũ.
    """
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(forms)")}
    if "context" not in columns:
        conn.execute(
            "ALTER TABLE forms ADD COLUMN context TEXT NOT NULL DEFAULT 'bao_duong'"
        )
    if "requesting_unit" not in columns:
        conn.execute(
            "ALTER TABLE forms ADD COLUMN requesting_unit TEXT NOT NULL DEFAULT ''"
        )
    conn.execute(
        """UPDATE forms SET form_type = 'tai_lap'
            WHERE form_type IN ('phieu_thao_tac', 'phieu_co_lap')
              AND work_type LIKE '%vào vận hành%'"""
    )
    conn.execute(
        """UPDATE forms SET form_type = 'co_lap'
            WHERE form_type IN ('phieu_thao_tac', 'phieu_co_lap')"""
    )
    _migrate_conditions(conn)
    conn.commit()


def _migrate_conditions(conn: sqlite3.Connection) -> None:
    """Đổi cột conditions từ đoạn văn sang danh sách JSON đánh số được.

    Phải chạy trước lần đọc đầu tiên: load_json trả về danh sách rỗng khi gặp
    chuỗi không phải JSON, nên đoạn văn cũ sẽ biến mất khỏi giao diện nếu bỏ
    qua bước này. Mỗi dòng của đoạn văn cũ thành một điều kiện.
    """
    for row in conn.execute("SELECT id, conditions FROM forms").fetchall():
        raw = (row["conditions"] or "").strip()
        if raw.startswith("["):
            continue
        items = [line.strip() for line in raw.split("\n") if line.strip()]
        conn.execute(
            "UPDATE forms SET conditions = ? WHERE id = ?",
            (json.dumps(items, ensure_ascii=False), row["id"]),
        )


def query(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    return get_conn().execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    return get_conn().execute(sql, params).fetchone()


def execute(sql: str, params: tuple | list = ()) -> int:
    with tx() as conn:
        cur = conn.execute(sql, params)
        return cur.lastrowid or cur.rowcount


def row_to_dict(row: sqlite3.Row | None, json_fields: tuple[str, ...] = ()) -> dict[str, Any] | None:
    if row is None:
        return None
    out = dict(row)
    for field in json_fields:
        if field in out:
            out[field] = load_json(out[field], [])
    return out


def rows_to_dicts(rows, json_fields: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    return [row_to_dict(r, json_fields) for r in rows]


def load_json(raw: Any, default: Any) -> Any:
    if raw in (None, ""):
        return default
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def dump_json(value: Any) -> str:
    return json.dumps(value or [], ensure_ascii=False)
