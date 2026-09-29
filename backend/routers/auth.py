"""Đăng nhập, đăng xuất, đổi mật khẩu, tạo tài khoản quản trị lần đầu."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from .. import auth
from ..db import get_conn, query_one

router = APIRouter(prefix="/api/auth", tags=["Đăng nhập"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _set_cookie(response: Response, token: str) -> None:
    # Cookie phiên (không đặt hạn): đóng trình duyệt là phải đăng nhập lại — máy
    # phòng điều khiển dùng chung cho cả kíp. Phía máy chủ còn giới hạn thời gian
    # không dùng (SESSION_IDLE_HOURS).
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", path="/")


@router.get("/trang-thai")
def status() -> dict:
    return {
        "needs_setup": auth.count_users() == 0,
        "user": auth.current_user(),
        "roles": auth.ROLES,
        "perm_labels": auth.PERM_LABELS,
        "role_perms": {k: sorted(v) for k, v in auth.ROLE_PERMS.items()},
    }


class SetupIn(BaseModel):
    username: str
    full_name: str
    title: str = ""
    password: str


@router.post("/khoi-tao")
def setup(payload: SetupIn, request: Request, response: Response) -> dict:
    """Lần chạy đầu, chưa có tài khoản nào: tạo tài khoản quản trị."""
    if auth.count_users() > 0:
        raise HTTPException(409, "Hệ thống đã có tài khoản. Đăng nhập bằng tài khoản quản trị.")
    username = auth.clean_username(payload.username)
    if not payload.full_name.strip():
        raise HTTPException(400, "Cần nhập họ tên")
    auth.check_password_rules(payload.password)
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO users (username, full_name, title, role, password_hash) VALUES (?, ?, ?, 'quan_tri', ?)",
        (username, payload.full_name.strip(), payload.title.strip(), auth.hash_password(payload.password)))
    conn.commit()
    token = auth.create_session(cur.lastrowid, _ip(request))
    _set_cookie(response, token)
    user = auth.public_user(query_one("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)))
    auth.log("Tạo tài khoản quản trị đầu tiên", user=user, target=username, method="POST",
             path=request.url.path, ip=_ip(request))
    return user


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/dang-nhap")
def login(payload: LoginIn, request: Request, response: Response) -> dict:
    username = (payload.username or "").strip().lower()
    auth.check_throttle(username)
    row = query_one("SELECT * FROM users WHERE username = ?", (username,))
    if row is None or not auth.verify_password(payload.password, row["password_hash"]):
        auth.record_fail(username)
        auth.log("Đăng nhập sai", username=username, method="POST", path=request.url.path,
                 status=401, ip=_ip(request))
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    if not row["active"]:
        raise HTTPException(403, "Tài khoản đã bị khoá. Liên hệ quản trị hệ thống.")
    auth.clear_fails(username)
    token = auth.create_session(row["id"], _ip(request))
    _set_cookie(response, token)
    user = auth.public_user(row)
    auth.log("Đăng nhập", user=user, method="POST", path=request.url.path, ip=_ip(request))
    return user


@router.post("/dang-xuat")
def logout(request: Request, response: Response) -> dict:
    user = auth.current_user()
    auth.end_session(request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    if user:
        auth.log("Đăng xuất", user=user, method="POST", path=request.url.path, ip=_ip(request))
    return {"ok": True}


class PasswordIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/doi-mat-khau")
def change_password(payload: PasswordIn, request: Request) -> dict:
    user = auth.current_user()
    if user is None:
        raise HTTPException(401, "Chưa đăng nhập")
    row = query_one("SELECT * FROM users WHERE id = ?", (user["id"],))
    if not auth.verify_password(payload.old_password, row["password_hash"]):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    auth.check_password_rules(payload.new_password)
    if payload.new_password == payload.old_password:
        raise HTTPException(400, "Mật khẩu mới phải khác mật khẩu cũ")
    conn = get_conn()
    conn.execute("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?",
                 (auth.hash_password(payload.new_password), user["id"]))
    conn.commit()
    # Đăng xuất các máy khác đang dùng tài khoản này, giữ phiên hiện tại.
    auth.end_user_sessions(user["id"], keep_token=request.cookies.get(auth.COOKIE))
    auth.log("Đổi mật khẩu", user=user, method="POST", path=request.url.path, ip=_ip(request))
    return auth.public_user(query_one("SELECT * FROM users WHERE id = ?", (user["id"],)))
