"""Đăng nhập, phân quyền theo chức danh và nhật ký hệ thống.

Mỗi yêu cầu /api/ đi qua middleware trong main.py: đọc cookie phiên, tra ra
người dùng, kiểm quyền theo bảng RULES, rồi ghi nhật ký các thao tác ghi. Kiểm
quyền đặt tập trung ở đây thay vì rải trong từng router, để nhìn một chỗ là
biết ai được làm gì. Các trường hợp phụ thuộc dữ liệu (huỷ phiếu người khác
lập, sửa nhật ký người khác ghi) thì router tự kiểm bằng current_user().
"""
from __future__ import annotations

import contextvars
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from . import config
from .db import get_conn, query, query_one

# ----------------------------------------------------------------- chức danh, quyền

ROLES = {
    "van_hanh": "Vận hành viên",
    "truong_ca": "Trưởng ca",
    "ky_thuat": "Kỹ thuật viên",
    "quan_tri": "Quản trị hệ thống",
}

PERM_LABELS = {
    "duyet": "Duyệt, huỷ phiếu thao tác",
    "mau": "Sửa phiếu thao tác mẫu",
    "tai_lieu": "Quản lý tài liệu, thiết bị, quy trình",
    "quan_tri": "Người dùng, cấu hình, sao lưu",
}

# Mọi tài khoản đều tra cứu, lập phiếu, tích bước, ghi nhật ký. Bảng dưới là
# quyền cộng thêm theo chức danh.
ROLE_PERMS = {
    "van_hanh": set(),
    "truong_ca": {"duyet", "mau"},
    "ky_thuat": {"mau", "tai_lieu"},
    "quan_tri": {"duyet", "mau", "tai_lieu", "quan_tri"},
}

# Không cần đăng nhập: khung giao diện, trang đăng nhập.
PUBLIC = {
    ("GET", "/api/thong-tin"),
    ("GET", "/api/giao-dien/tep"),
    ("GET", "/api/auth/trang-thai"),
    ("POST", "/api/auth/dang-nhap"),
    ("POST", "/api/auth/khoi-tao"),
}

WRITE = ("POST", "PUT", "PATCH", "DELETE")

# (phương thức, đường dẫn, quyền cần có). Luật đầu tiên khớp được áp dụng;
# không khớp luật nào thì chỉ cần đăng nhập.
RULES: list[tuple[tuple[str, ...], re.Pattern, str | None]] = [(m, re.compile(p), perm) for m, p, perm in [
    (("GET", *WRITE), r"^/api/quan-tri(/|$)", "quan_tri"),
    (WRITE, r"^/api/reindex$", "quan_tri"),
    (WRITE, r"^/api/ptt/cau-hinh(/|$)", "quan_tri"),
    (WRITE, r"^/api/ptt/phieu/\d+/duyet$", "duyet"),
    (WRITE, r"^/api/ptt/(nhom|mau)(/|$)", "mau"),
    (WRITE, r"^/api/(documents|equipment|procedures|forms)(/|$)", "tai_lieu"),
]]


def perms_of(role: str) -> set[str]:
    return set(ROLE_PERMS.get(role, set()))


def is_public(method: str, path: str) -> bool:
    return (method, path) in PUBLIC


def required_perm(method: str, path: str) -> str | None:
    for methods, pattern, perm in RULES:
        if method in methods and pattern.search(path):
            return perm
    return None


def denied_message(perm: str) -> str:
    return f"Tài khoản của bạn không có quyền: {PERM_LABELS.get(perm, perm).lower()}. Liên hệ quản trị hệ thống."


# ----------------------------------------------------------------- mật khẩu

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(check.hex(), digest)


def check_password_rules(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(400, "Mật khẩu cần ít nhất 6 ký tự")


USERNAME_RE = re.compile(r"^[a-z0-9._-]{2,32}$")


def clean_username(value: str) -> str:
    name = (value or "").strip().lower()
    if not USERNAME_RE.match(name):
        raise HTTPException(400, "Tên đăng nhập 2–32 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang")
    return name


# ----------------------------------------------------------------- người dùng hiện tại

_user_var: contextvars.ContextVar[dict | None] = contextvars.ContextVar("huana_user", default=None)
_note_var: contextvars.ContextVar[dict | None] = contextvars.ContextVar("huana_note", default=None)


def public_user(row) -> dict:
    perms = perms_of(row["role"])
    return {
        "id": row["id"], "username": row["username"], "full_name": row["full_name"], "title": row["title"],
        "role": row["role"], "role_label": ROLES.get(row["role"], row["role"]),
        "perms": sorted(perms), "must_change": bool(row["must_change"]),
    }


def current_user() -> dict | None:
    return _user_var.get()


def has(perm: str) -> bool:
    user = current_user()
    return bool(user and perm in user["perms"])


def require(perm: str) -> dict:
    user = current_user()
    if user is None:
        raise HTTPException(401, "Chưa đăng nhập hoặc phiên đã hết hạn")
    if perm not in user["perms"]:
        raise HTTPException(403, denied_message(perm))
    return user


def display_name() -> str:
    user = current_user()
    return user["full_name"] if user else ""


def note(target: str) -> None:
    """Router ghi thêm đối tượng cho dòng nhật ký hệ thống (VD số phiếu)."""
    box = _note_var.get()
    if box is not None:
        box["target"] = target


def bind(user: dict | None) -> tuple:
    return _user_var.set(user), _note_var.set({})


def unbind(tokens: tuple) -> dict:
    user_token, note_token = tokens
    box = _note_var.get() or {}
    _user_var.reset(user_token)
    _note_var.reset(note_token)
    return box


# ----------------------------------------------------------------- phiên đăng nhập

COOKIE = "huana_phien"
_TOUCH_EVERY = 60  # giây: không ghi CSDL ở mỗi yêu cầu


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: int, ip: str = "") -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    conn = get_conn()
    conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, last_seen, ip) VALUES (?, ?, ?, ?, ?)",
                 (_token_hash(token), user_id, now, now, ip))
    # Dọn phiên đã hết hạn cho bảng khỏi phình.
    conn.execute("DELETE FROM sessions WHERE last_seen < ?", (now - config.SESSION_IDLE_HOURS * 3600,))
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now_iso(), user_id))
    conn.commit()
    return token


def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    key = _token_hash(token)
    row = query_one(
        """SELECT u.*, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND u.active = 1""", (key,))
    if row is None:
        return None
    now = time.time()
    conn = get_conn()
    if now - row["last_seen"] > config.SESSION_IDLE_HOURS * 3600:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (key,))
        conn.commit()
        return None
    if now - row["last_seen"] > _TOUCH_EVERY:
        conn.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", (now, key))
        conn.commit()
    return public_user(row)


def end_session(token: str | None) -> None:
    if token:
        conn = get_conn()
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        conn.commit()


def end_user_sessions(user_id: int, keep_token: str | None = None) -> None:
    conn = get_conn()
    if keep_token:
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", (user_id, _token_hash(keep_token)))
    else:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()


# Chống dò mật khẩu: sai 5 lần liền thì khoá tài khoản đó 1 phút (trong bộ nhớ,
# khởi động lại máy chủ là hết — đủ cho mạng nội bộ).
_FAILS: dict[str, list[float]] = {}
MAX_FAILS = 5
LOCK_SECONDS = 60


def check_throttle(username: str) -> None:
    now = time.time()
    recent = [t for t in _FAILS.get(username, []) if now - t < LOCK_SECONDS]
    _FAILS[username] = recent
    if len(recent) >= MAX_FAILS:
        wait = int(LOCK_SECONDS - (now - recent[0])) + 1
        raise HTTPException(429, f"Nhập sai mật khẩu nhiều lần. Thử lại sau {wait} giây.")


def record_fail(username: str) -> None:
    _FAILS.setdefault(username, []).append(time.time())


def clear_fails(username: str) -> None:
    _FAILS.pop(username, None)


# ----------------------------------------------------------------- nhật ký hệ thống

def now_iso() -> str:
    tz = timezone(timedelta(hours=config.TIMEZONE_OFFSET_HOURS))
    return datetime.now(tz).strftime("%Y-%m-%dT%H:%M:%S")


# Nhãn hành động cho các yêu cầu ghi. Không có trong bảng thì không ghi nhật ký
# (hỏi trợ lý, đọc Excel thử... không làm thay đổi dữ liệu).
_ACTIONS: list[tuple[str, re.Pattern, str]] = [(m, re.compile(p), label) for m, p, label in [
    ("POST", r"^/api/ptt/phieu$", "Lập phiếu thao tác"),
    ("PUT", r"^/api/ptt/phieu/\d+$", "Sửa phiếu thao tác"),
    ("POST", r"^/api/ptt/phieu/\d+/duyet$", "Duyệt phiếu thao tác"),
    ("POST", r"^/api/ptt/phieu/\d+/tiep-nhan$", "Tiếp nhận phiếu thao tác"),
    ("POST", r"^/api/ptt/phieu/\d+/hoan-thanh$", "Hoàn thành phiếu thao tác"),
    ("POST", r"^/api/ptt/phieu/\d+/huy$", "Huỷ phiếu thao tác"),
    ("PUT", r"^/api/ptt/phieu/\d+/buoc/\d+$", "Tích / bỏ tích bước thao tác"),
    ("POST", r"^/api/ptt/phieu/\d+/dinh-kem$", "Đính kèm tệp vào phiếu"),
    ("DELETE", r"^/api/ptt/dinh-kem/\d+$", "Xoá tệp đính kèm phiếu"),
    ("POST", r"^/api/ptt/nhom$", "Thêm nhóm phiếu mẫu"),
    ("PUT", r"^/api/ptt/nhom/\d+$", "Sửa nhóm phiếu mẫu"),
    ("DELETE", r"^/api/ptt/nhom/\d+$", "Xoá nhóm phiếu mẫu"),
    ("POST", r"^/api/ptt/mau$", "Thêm phiếu thao tác mẫu"),
    ("PUT", r"^/api/ptt/mau/\d+$", "Sửa phiếu thao tác mẫu"),
    ("DELETE", r"^/api/ptt/mau/\d+$", "Xoá phiếu thao tác mẫu"),
    ("POST", r"^/api/ptt/mau/\d+/sao-chep$", "Sao chép phiếu thao tác mẫu"),
    ("PUT", r"^/api/ptt/cau-hinh$", "Sửa cấu hình phiếu thao tác"),
    ("POST", r"^/api/ptt/cau-hinh/mau-in$", "Tải lên mẫu in phiếu"),
    ("DELETE", r"^/api/ptt/cau-hinh/mau-in$", "Khôi phục mẫu in phiếu mặc định"),
    ("POST", r"^/api/documents$", "Tải lên tài liệu"),
    ("PUT", r"^/api/documents/\d+$", "Sửa thông tin tài liệu"),
    ("POST", r"^/api/documents/\d+/reindex$", "Đọc lại tài liệu"),
    ("POST", r"^/api/documents/\d+/tep$", "Thay tệp tài liệu"),
    ("DELETE", r"^/api/documents/\d+$", "Xoá tài liệu"),
    ("POST", r"^/api/nhat-ky$", "Ghi nhật ký nghiệp vụ"),
    ("PUT", r"^/api/nhat-ky/\d+$", "Sửa nhật ký nghiệp vụ"),
    ("DELETE", r"^/api/nhat-ky/\d+$", "Xoá nhật ký nghiệp vụ"),
    ("POST", r"^/api/incidents$", "Thêm hồ sơ sự cố"),
    ("PUT", r"^/api/incidents/\d+$", "Sửa hồ sơ sự cố"),
    ("DELETE", r"^/api/incidents/\d+$", "Xoá hồ sơ sự cố"),
    ("POST", r"^/api/equipment$", "Thêm thiết bị"),
    ("PUT", r"^/api/equipment/\d+$", "Sửa thiết bị"),
    ("DELETE", r"^/api/equipment/\d+$", "Xoá thiết bị"),
    ("POST", r"^/api/procedures$", "Thêm quy trình"),
    ("PUT", r"^/api/procedures/\d+$", "Sửa quy trình"),
    ("DELETE", r"^/api/procedures/\d+$", "Xoá quy trình"),
    ("POST", r"^/api/forms(/\d+/duplicate)?$", "Thêm biểu mẫu"),
    ("PUT", r"^/api/forms/\d+$", "Sửa biểu mẫu"),
    ("DELETE", r"^/api/forms/\d+$", "Xoá biểu mẫu"),
    ("POST", r"^/api/reindex$", "Dựng lại chỉ mục tra cứu"),
    ("POST", r"^/api/quan-tri/nguoi-dung$", "Thêm tài khoản"),
    ("PUT", r"^/api/quan-tri/nguoi-dung/\d+$", "Sửa tài khoản"),
    ("DELETE", r"^/api/quan-tri/nguoi-dung/\d+$", "Xoá tài khoản"),
    ("POST", r"^/api/quan-tri/sao-luu$", "Sao lưu dữ liệu"),
    ("POST", r"^/api/quan-tri/don-du-lieu$", "Dọn dữ liệu"),
]]

# Đối tượng bị tác động, tra theo số trong đường dẫn.
_TARGETS: list[tuple[re.Pattern, str, str]] = [(re.compile(p), sql, prefix) for p, sql, prefix in [
    (r"^/api/ptt/phieu/(\d+)", "SELECT code || ' — ' || name AS t FROM ptt_tickets WHERE id = ?", "Phiếu "),
    (r"^/api/ptt/mau/(\d+)", "SELECT name AS t FROM ptt_templates WHERE id = ?", "Mẫu: "),
    (r"^/api/ptt/nhom/(\d+)", "SELECT name AS t FROM ptt_groups WHERE id = ?", "Nhóm: "),
    (r"^/api/documents/(\d+)", "SELECT title AS t FROM documents WHERE id = ?", ""),
    (r"^/api/nhat-ky/(\d+)", "SELECT title AS t FROM journal WHERE id = ?", ""),
    (r"^/api/incidents/(\d+)", "SELECT code || ' ' || title AS t FROM incidents WHERE id = ?", ""),
    (r"^/api/equipment/(\d+)", "SELECT code || ' ' || name AS t FROM equipment WHERE id = ?", ""),
    (r"^/api/procedures/(\d+)", "SELECT code || ' ' || title AS t FROM procedures WHERE id = ?", ""),
    (r"^/api/quan-tri/nguoi-dung/(\d+)", "SELECT full_name || ' (' || username || ')' AS t FROM users WHERE id = ?", ""),
]]


def action_label(method: str, path: str) -> str | None:
    for m, pattern, label in _ACTIONS:
        if m == method and pattern.search(path):
            return label
    return None


def target_of(path: str) -> str:
    for pattern, sql, prefix in _TARGETS:
        m = pattern.search(path)
        if m:
            try:
                row = query_one(sql, (int(m.group(1)),))
            except Exception:
                return ""
            return f"{prefix}{row['t']}" if row and row["t"] else ""
    return ""


def log(action: str, *, user: dict | None = None, target: str = "", method: str = "", path: str = "",
        status: int = 200, ip: str = "", username: str = "") -> None:
    conn = get_conn()
    conn.execute(
        """INSERT INTO audit_log (created_at, user_id, username, full_name, action, target, method, path, status, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (now_iso(), user["id"] if user else None, user["username"] if user else username,
         user["full_name"] if user else "", action, target[:300], method, path, status, ip),
    )
    conn.commit()


def count_users() -> int:
    return query_one("SELECT COUNT(*) AS n FROM users")["n"]


def active_admins(exclude_id: int | None = None) -> int:
    rows = query("SELECT id FROM users WHERE role = 'quan_tri' AND active = 1")
    return sum(1 for r in rows if r["id"] != exclude_id)
