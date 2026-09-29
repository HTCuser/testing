"""Quản trị: tài khoản người dùng, nhật ký hệ thống, sao lưu, dọn dữ liệu thử.

Toàn bộ /api/quan-tri/ chỉ dành cho tài khoản Quản trị hệ thống (luật trong auth.RULES).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from .. import auth, config, saoluu
from ..db import get_conn, query, query_one
from ..rag.index import index

router = APIRouter(prefix="/api/quan-tri", tags=["Quản trị"])


# ------------------------------------------------------------------ người dùng

def _users() -> list[dict]:
    out = []
    for r in query("SELECT * FROM users ORDER BY active DESC, role = 'quan_tri' DESC, full_name"):
        u = auth.public_user(r)
        u.update(active=bool(r["active"]), last_login=r["last_login"], created_at=r["created_at"])
        out.append(u)
    return out


@router.get("/nguoi-dung")
def list_users() -> dict:
    return {"items": _users(), "roles": auth.ROLES, "perm_labels": auth.PERM_LABELS,
            "role_perms": {k: sorted(v) for k, v in auth.ROLE_PERMS.items()}}


class UserIn(BaseModel):
    username: str
    full_name: str
    title: str = ""
    role: str = "van_hanh"
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    title: str | None = None
    role: str | None = None
    active: bool | None = None
    password: str | None = None  # quản trị đặt lại mật khẩu


def _check_role(role: str) -> str:
    if role not in auth.ROLES:
        raise HTTPException(400, "Chức danh không hợp lệ")
    return role


@router.post("/nguoi-dung", status_code=201)
def create_user(payload: UserIn) -> dict:
    username = auth.clean_username(payload.username)
    if not payload.full_name.strip():
        raise HTTPException(400, "Cần nhập họ tên")
    auth.check_password_rules(payload.password)
    if query_one("SELECT id FROM users WHERE username = ?", (username,)):
        raise HTTPException(409, f"Tên đăng nhập \"{username}\" đã có")
    conn = get_conn()
    # Mật khẩu do quản trị đặt: người dùng phải đổi ở lần đăng nhập đầu.
    conn.execute(
        """INSERT INTO users (username, full_name, title, role, password_hash, must_change)
           VALUES (?, ?, ?, ?, ?, 1)""",
        (username, payload.full_name.strip(), payload.title.strip(), _check_role(payload.role),
         auth.hash_password(payload.password)))
    conn.commit()
    auth.note(f"{payload.full_name.strip()} ({username})")
    return {"items": _users()}


@router.put("/nguoi-dung/{user_id}")
def update_user(user_id: int, payload: UserUpdate) -> dict:
    row = query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    if row is None:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    me = auth.current_user()
    losing_admin = row["role"] == "quan_tri" and (
        (payload.role is not None and payload.role != "quan_tri") or payload.active is False)
    if losing_admin and auth.active_admins(exclude_id=user_id) == 0:
        raise HTTPException(409, "Phải còn ít nhất một tài khoản Quản trị hệ thống đang hoạt động")
    if me and me["id"] == user_id and payload.active is False:
        raise HTTPException(409, "Không tự khoá tài khoản mình đang dùng")
    sets, params = [], []
    if payload.full_name is not None:
        if not payload.full_name.strip():
            raise HTTPException(400, "Cần nhập họ tên")
        sets.append("full_name = ?")
        params.append(payload.full_name.strip())
    if payload.title is not None:
        sets.append("title = ?")
        params.append(payload.title.strip())
    if payload.role is not None:
        sets.append("role = ?")
        params.append(_check_role(payload.role))
    if payload.active is not None:
        sets.append("active = ?")
        params.append(1 if payload.active else 0)
    if payload.password:
        auth.check_password_rules(payload.password)
        sets += ["password_hash = ?", "must_change = 1"]
        params.append(auth.hash_password(payload.password))
    if sets:
        conn = get_conn()
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", (*params, user_id))
        conn.commit()
    if payload.active is False or payload.password:
        auth.end_user_sessions(user_id)
    return {"items": _users()}


@router.delete("/nguoi-dung/{user_id}", status_code=204)
def delete_user(user_id: int) -> Response:
    row = query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    if row is None:
        return Response(status_code=204)
    me = auth.current_user()
    if me and me["id"] == user_id:
        raise HTTPException(409, "Không xoá tài khoản mình đang dùng")
    if row["role"] == "quan_tri" and row["active"] and auth.active_admins(exclude_id=user_id) == 0:
        raise HTTPException(409, "Phải còn ít nhất một tài khoản Quản trị hệ thống đang hoạt động")
    conn = get_conn()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ nhật ký hệ thống

@router.get("/nhat-ky")
def audit(q: str = "", nguoi: str = "", tu: str = "", den: str = "", trang: int = 1) -> dict:
    sql = " FROM audit_log WHERE 1 = 1"
    params: list = []
    if nguoi:
        sql += " AND username = ?"
        params.append(nguoi)
    if tu:
        sql += " AND created_at >= ?"
        params.append(tu)
    if den:
        sql += " AND created_at < ?"
        params.append(den + "T99")  # hết ngày "den"
    if q.strip():
        sql += " AND (action LIKE ? OR target LIKE ? OR full_name LIKE ? OR username LIKE ?)"
        params += [f"%{q.strip()}%"] * 4
    per_page = 100
    total = query_one(f"SELECT COUNT(*) AS n{sql}", params)["n"]
    rows = query(f"SELECT *{sql} ORDER BY id DESC LIMIT ? OFFSET ?", (*params, per_page, (max(trang, 1) - 1) * per_page))
    users = [r["username"] for r in query("SELECT DISTINCT username FROM audit_log WHERE username <> '' ORDER BY username")]
    return {"items": [dict(r) for r in rows], "total": total, "page": max(trang, 1), "per_page": per_page,
            "users": users}


# ------------------------------------------------------------------ sao lưu

@router.get("/sao-luu")
def backup_status() -> dict:
    return saoluu.status()


@router.post("/sao-luu")
def backup_now() -> dict:
    try:
        result = saoluu.run_backup()
    except Exception as exc:
        raise HTTPException(500, f"Sao lưu thất bại: {exc}")
    auth.note(result["name"])
    return {**result, **saoluu.status()}


# ------------------------------------------------------------------ dọn dữ liệu thử

class CleanupIn(BaseModel):
    phieu_thao_tac: bool = False
    nhat_ky: bool = False
    lich_su_hoi: bool = False
    du_lieu_mau: bool = False
    nhat_ky_he_thong: bool = False
    xac_nhan: str = ""


@router.get("/don-du-lieu")
def cleanup_counts() -> dict:
    n = lambda sql: query_one(sql)["n"]  # noqa: E731
    return {
        "phieu_thao_tac": n("SELECT COUNT(*) AS n FROM ptt_tickets"),
        "nhat_ky": n("SELECT COUNT(*) AS n FROM journal"),
        "lich_su_hoi": n("SELECT COUNT(*) AS n FROM chat_logs"),
        "nhat_ky_he_thong": n("SELECT COUNT(*) AS n FROM audit_log"),
        "du_lieu_mau": _sample_count(),
    }


def _sample_count() -> int:
    from .. import seed

    total = 0
    for table, items in (("procedures", seed.PROCEDURES), ("incidents", seed.INCIDENTS),
                         ("forms", seed.FORMS), ("equipment", seed.EQUIPMENT)):
        codes = [i["code"] for i in items]
        if codes:
            total += query_one(f"SELECT COUNT(*) AS n FROM {table} WHERE code IN ({','.join('?' * len(codes))})",
                               codes)["n"]
    return total


@router.post("/don-du-lieu")
def cleanup(payload: CleanupIn) -> dict:
    """Xoá dữ liệu nhập thử trước ngày dùng chính thức. Luôn sao lưu trước."""
    if payload.xac_nhan.strip().upper() != "XOA":
        raise HTTPException(400, "Gõ XOA vào ô xác nhận để thực hiện")
    chosen = [k for k in ("phieu_thao_tac", "nhat_ky", "lich_su_hoi", "du_lieu_mau", "nhat_ky_he_thong")
              if getattr(payload, k)]
    if not chosen:
        raise HTTPException(400, "Chưa chọn mục nào để dọn")
    try:
        backup = saoluu.run_backup()
    except Exception as exc:
        raise HTTPException(500, f"Không sao lưu được nên chưa xoá gì: {exc}")
    done: dict[str, int] = {}
    conn = get_conn()
    if payload.phieu_thao_tac:
        files = [r["stored_name"] for r in query("SELECT stored_name FROM ptt_attachments")]
        done["phieu_thao_tac"] = conn.execute("DELETE FROM ptt_tickets").rowcount
        # Số phiếu bắt đầu lại từ 1 (hoặc số đặt trong Cấu hình phiếu sau đó).
        conn.execute("DELETE FROM ticket_counters WHERE book LIKE 'ptt:%'")
        conn.commit()
        for name in files:
            (config.PTT_FILE_DIR / name).unlink(missing_ok=True)
    if payload.nhat_ky:
        done["nhat_ky"] = conn.execute("DELETE FROM journal").rowcount
        conn.execute("DELETE FROM documents WHERE source_kind IN ('nhat_ky_thao_tac', 'nhat_ky_bao_duong')")
        conn.commit()
    if payload.lich_su_hoi:
        done["lich_su_hoi"] = conn.execute("DELETE FROM chat_logs").rowcount
        conn.commit()
    if payload.du_lieu_mau:
        from .. import seed

        done["du_lieu_mau"] = _sample_count()
        seed.purge()
    if payload.nhat_ky_he_thong:
        done["nhat_ky_he_thong"] = conn.execute("DELETE FROM audit_log").rowcount
        conn.commit()
    index.rebuild()
    auth.note(", ".join(f"{k}: {v}" for k, v in done.items()))
    return {"done": done, "backup": backup["name"], "counts": cleanup_counts()}
