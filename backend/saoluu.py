"""Sao lưu và khôi phục dữ liệu.

    python -m backend.saoluu                 sao lưu ngay
    python -m backend.saoluu --danh-sach     liệt kê các bản sao lưu
    python -m backend.saoluu --khoi-phuc     khôi phục (hỏi chọn bản) — phải dừng máy chủ trước

Mỗi lần sao lưu tạo một thư mục <SAO_LUU_DIR>/<ngày_giờ>/ chứa bản chụp CSDL
huana.db, lấy bằng API backup của SQLite nên chạy được cả khi phần mềm đang
mở (chép thẳng file đang ghi dở có thể được bản hỏng). Các tệp (tài liệu gốc,
mẫu in, đính kèm phiếu) chỉ thêm, không sửa sau khi tải lên, nên được chép
một lần vào <SAO_LUU_DIR>/tep/ — lần sau chỉ chép tệp mới, không nhân bản
hàng GB tài liệu mỗi ngày. Bản chụp CSDL cũ hơn SAO_LUU_GIU_NGAY ngày được
xoá, nhưng luôn giữ lại ít nhất 7 bản gần nhất.
"""
from __future__ import annotations

import shutil
import socket
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config

FILE_DIRS = {
    "uploads": config.UPLOAD_DIR,
    "mau_phieu": config.TICKET_TEMPLATE_DIR,
    "phieu": config.TICKET_DIR,
    "ptt_dinh_kem": config.PTT_FILE_DIR,
}
MIN_KEEP = 7
STAMP = "%Y-%m-%d_%H%M"


def _now() -> datetime:
    return datetime.now(timezone(timedelta(hours=config.TIMEZONE_OFFSET_HOURS))).replace(tzinfo=None)


def _dir_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def snapshots() -> list[dict]:
    root = config.BACKUP_DIR
    if not root.is_dir():
        return []
    items = []
    for d in root.iterdir():
        db = d / "huana.db"
        if not d.is_dir() or not db.is_file():
            continue
        try:
            when = datetime.strptime(d.name, STAMP)
        except ValueError:
            continue
        items.append({"name": d.name, "time": when.strftime("%Y-%m-%dT%H:%M"), "size_bytes": db.stat().st_size})
    return sorted(items, key=lambda x: x["name"], reverse=True)


def _mirror_files(dest_root: Path) -> tuple[int, int]:
    copied = total = 0
    for name, src in FILE_DIRS.items():
        if not src.is_dir():
            continue
        for f in src.rglob("*"):
            if not f.is_file():
                continue
            total += 1
            target = dest_root / name / f.relative_to(src)
            st = f.stat()
            if target.is_file() and target.stat().st_size == st.st_size and target.stat().st_mtime >= st.st_mtime:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, target)
            copied += 1
    return copied, total


def _prune() -> list[str]:
    items = snapshots()
    limit = _now() - timedelta(days=config.BACKUP_KEEP_DAYS)
    removed = []
    for item in items[MIN_KEEP:]:
        if datetime.strptime(item["name"], STAMP) < limit:
            shutil.rmtree(config.BACKUP_DIR / item["name"], ignore_errors=True)
            removed.append(item["name"])
    return removed


def run_backup() -> dict:
    """Sao lưu CSDL và các tệp. Trả về tóm tắt để hiển thị / ghi log."""
    started = time.time()
    root = config.BACKUP_DIR
    root.mkdir(parents=True, exist_ok=True)
    name = _now().strftime(STAMP)
    dest = root / name
    suffix = 1
    while dest.exists():  # hai lần sao lưu trong cùng một phút
        suffix += 1
        dest = root / f"{name}-{suffix}"
    dest.mkdir()
    src = sqlite3.connect(config.DB_PATH, timeout=30)
    dst = sqlite3.connect(dest / "huana.db")
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    check = sqlite3.connect(dest / "huana.db")
    try:
        ok = check.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        check.close()
    if not ok:
        raise RuntimeError(f"Bản sao lưu {dest} không toàn vẹn — kiểm tra lại ổ đĩa sao lưu")
    copied, total = _mirror_files(root / "tep")
    removed = _prune()
    return {
        "name": dest.name, "folder": str(dest), "db_bytes": (dest / "huana.db").stat().st_size,
        "files_copied": copied, "files_total": total, "removed": removed,
        "seconds": round(time.time() - started, 1),
    }


def status() -> dict:
    items = snapshots()
    tep = config.BACKUP_DIR / "tep"
    return {"folder": str(config.BACKUP_DIR), "keep_days": config.BACKUP_KEEP_DAYS, "items": items,
            "files_bytes": _dir_size(tep) if tep.is_dir() else 0,
            "same_drive": config.BACKUP_DIR.resolve().anchor.lower() == config.BASE_DIR.resolve().anchor.lower()}


# --------------------------------------------------------------------- khôi phục

def _server_running() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", config.PORT)) == 0


def restore(name: str) -> dict:
    snap = config.BACKUP_DIR / name / "huana.db"
    if not snap.is_file():
        raise FileNotFoundError(f"Không có bản sao lưu {name}")
    if _server_running():
        raise RuntimeError(
            f"Phần mềm đang chạy (cổng {config.PORT}). Dừng máy chủ trước (dung-may-chu.bat hoặc đóng cửa sổ run.bat).")
    keep = config.DATA_DIR / f"huana.db.truoc-khoi-phuc-{_now().strftime(STAMP)}"
    if config.DB_PATH.exists():
        # Checkpoint WAL vào file chính rồi mới cất đi, để bản cất giữ là trọn vẹn.
        conn = sqlite3.connect(config.DB_PATH)
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            conn.close()
        shutil.move(str(config.DB_PATH), keep)
    for extra in ("-wal", "-shm"):
        Path(f"{config.DB_PATH}{extra}").unlink(missing_ok=True)
    shutil.copy2(snap, config.DB_PATH)
    # Tệp bị xoá nhầm sau thời điểm sao lưu: chép lại những tệp còn thiếu.
    restored = 0
    tep = config.BACKUP_DIR / "tep"
    for folder, target in FILE_DIRS.items():
        src = tep / folder
        if not src.is_dir():
            continue
        for f in src.rglob("*"):
            dest = target / f.relative_to(src)
            if f.is_file() and not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)
                restored += 1
    return {"restored_from": name, "previous_saved_as": str(keep) if keep.exists() else "", "files_restored": restored}


# --------------------------------------------------------------------- dòng lệnh

def _print_list(items: list[dict]) -> None:
    if not items:
        print(f"Chưa có bản sao lưu nào trong {config.BACKUP_DIR}")
        return
    print(f"Các bản sao lưu trong {config.BACKUP_DIR}:")
    for i, it in enumerate(items, start=1):
        print(f"  {i:>3}. {it['name']}   ({it['size_bytes'] / 1024 / 1024:.1f} MB)")


def main(argv: list[str]) -> int:
    if "--danh-sach" in argv:
        _print_list(snapshots())
        return 0
    if "--khoi-phuc" in argv:
        items = snapshots()
        _print_list(items)
        if not items:
            return 1
        rest = [a for a in argv if not a.startswith("--")]
        choice = rest[0] if rest else input("\nNhập số thứ tự bản cần khôi phục (Enter để huỷ): ").strip()
        if not choice:
            print("Đã huỷ.")
            return 1
        name = items[int(choice) - 1]["name"] if choice.isdigit() and 0 < int(choice) <= len(items) else choice
        if not rest:
            ok = input(f"Khôi phục bản {name}? Dữ liệu hiện tại sẽ được cất sang file .truoc-khoi-phuc. [c/k] ")
            if ok.strip().lower() not in ("c", "co", "có", "y"):
                print("Đã huỷ.")
                return 1
        try:
            result = restore(name)
        except (RuntimeError, FileNotFoundError) as exc:
            print(f"[LỖI] {exc}")
            return 1
        print(f"Đã khôi phục từ bản {result['restored_from']}.")
        if result["previous_saved_as"]:
            print(f"Dữ liệu trước khi khôi phục được cất tại: {result['previous_saved_as']}")
        print(f"Chép lại {result['files_restored']} tệp còn thiếu. Khởi động lại phần mềm để dùng.")
        return 0
    try:
        r = run_backup()
    except Exception as exc:  # chạy theo lịch: ghi rõ lỗi ra log
        print(f"[{_now():%Y-%m-%d %H:%M}] [LỖI] Sao lưu thất bại: {exc}")
        return 1
    print(f"[{_now():%Y-%m-%d %H:%M}] Đã sao lưu vào {r['folder']} "
          f"(CSDL {r['db_bytes'] / 1024 / 1024:.1f} MB, chép {r['files_copied']}/{r['files_total']} tệp, "
          f"xoá {len(r['removed'])} bản cũ, {r['seconds']} giây)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
