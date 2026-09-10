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
    form_type     TEXT NOT NULL DEFAULT 'phieu_thao_tac',
    work_type     TEXT NOT NULL DEFAULT '',
    equipment_id  INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    purpose       TEXT NOT NULL DEFAULT '',
    conditions    TEXT NOT NULL DEFAULT '',
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
