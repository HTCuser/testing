"""Quản lý tài khoản từ dòng lệnh — dùng khi quên mật khẩu quản trị.

    python -m backend.taikhoan                       liệt kê tài khoản
    python -m backend.taikhoan --dat-lai <ten>       đặt lại mật khẩu (và mở khoá)
    python -m backend.taikhoan --tao-quan-tri <ten>  tạo tài khoản quản trị mới

Chạy trên chính máy chủ, trong thư mục phần mềm (tai-khoan.bat làm sẵn việc này).
"""
from __future__ import annotations

import getpass
import sys

from . import auth
from .db import get_conn, init_db, query, query_one


def _ask_password() -> str:
    while True:
        pw = getpass.getpass("Mật khẩu mới (ít nhất 6 ký tự, gõ không hiện chữ): ")
        if len(pw) < 6:
            print("  Mật khẩu quá ngắn.")
            continue
        if getpass.getpass("Nhập lại mật khẩu: ") != pw:
            print("  Hai lần nhập không khớp.")
            continue
        return pw


def main(argv: list[str]) -> int:
    init_db()
    conn = get_conn()
    if "--dat-lai" in argv or "--tao-quan-tri" in argv:
        flag = "--dat-lai" if "--dat-lai" in argv else "--tao-quan-tri"
        i = argv.index(flag)
        name = argv[i + 1] if i + 1 < len(argv) else input("Tên đăng nhập: ")
        name = name.strip().lower()
        row = query_one("SELECT * FROM users WHERE username = ?", (name,))
        if flag == "--dat-lai":
            if row is None:
                print(f"[LỖI] Không có tài khoản \"{name}\".")
                return 1
            pw = _ask_password()
            conn.execute("UPDATE users SET password_hash = ?, active = 1, must_change = 0 WHERE id = ?",
                         (auth.hash_password(pw), row["id"]))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            conn.commit()
            auth.log("Đặt lại mật khẩu từ dòng lệnh máy chủ", target=name, username=name)
            print(f"Đã đặt lại mật khẩu và mở khoá tài khoản \"{name}\".")
            return 0
        if row is not None:
            print(f"[LỖI] Tên \"{name}\" đã có. Dùng --dat-lai {name} để đặt lại mật khẩu.")
            return 1
        try:
            name = auth.clean_username(name)
        except Exception as exc:  # HTTPException
            print(f"[LỖI] {getattr(exc, 'detail', exc)}")
            return 1
        full_name = input("Họ tên: ").strip() or name
        pw = _ask_password()
        conn.execute("INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, 'quan_tri', ?)",
                     (name, full_name, auth.hash_password(pw)))
        conn.commit()
        auth.log("Tạo tài khoản quản trị từ dòng lệnh máy chủ", target=name, username=name)
        print(f"Đã tạo tài khoản quản trị \"{name}\".")
        return 0

    rows = query("SELECT * FROM users ORDER BY role, username")
    if not rows:
        print("Chưa có tài khoản nào. Mở phần mềm trên trình duyệt để tạo tài khoản quản trị đầu tiên.")
        return 0
    print(f"{'Tên đăng nhập':<18} {'Họ tên':<28} {'Chức danh':<22} Trạng thái")
    for r in rows:
        print(f"{r['username']:<18} {r['full_name']:<28} {auth.ROLES.get(r['role'], r['role']):<22} "
              f"{'đang dùng' if r['active'] else 'đã khoá'}")
    print("\nĐặt lại mật khẩu:  python -m backend.taikhoan --dat-lai <tên đăng nhập>")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
