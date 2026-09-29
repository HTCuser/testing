"""Điểm khởi động ứng dụng: trợ lý kỹ thuật Nhà máy Thủy điện Hủa Na."""
from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth, config
from .db import init_db
from .rag.index import index
from .routers import admin, chat, documents, equipment, forms, incidents, procedures, system, journal, ptt
from .routers import auth as auth_routes


# Windows lấy kiểu file từ Registry; có máy ghi .js là "text/plain" (do phần mềm
# khác cài đè) và trình duyệt từ chối chạy module JS -> trang không khởi động.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    index.rebuild()
    yield


app = FastAPI(
    title="Trợ lý kỹ thuật Nhà máy Thủy điện Hủa Na",
    description=(
        "Hệ thống RAG cho thư viện kỹ thuật nhà máy: tra cứu tài liệu, quy trình vận hành, "
        "xử lý sự cố, bảo dưỡng sửa chữa và biểu mẫu phiếu thao tác."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

for module in (auth_routes, admin, system, chat, documents, equipment, procedures, incidents, forms, journal, ptt):
    app.include_router(module.router)


@app.middleware("http")
async def no_stale_frontend(request: Request, call_next):
    # Không có Cache-Control, trình duyệt tự giữ file JS cũ vài giờ: sau git pull
    # nó trộn file cũ với file mới, một import hỏng là cả trang đứng ở "Đang khởi
    # động". "no-cache" = luôn hỏi lại máy chủ; file không đổi thì chỉ nhận 304.
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


_API_DOCS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def authenticate(request: Request, call_next):
    """Đăng nhập + phân quyền + nhật ký hệ thống cho mọi yêu cầu /api/."""
    path, method = request.url.path, request.method
    if not (path.startswith("/api/") or path in _API_DOCS):
        return await call_next(request)
    user = auth.session_user(request.cookies.get(auth.COOKIE))
    if not auth.is_public(method, path):
        if user is None:
            return JSONResponse({"detail": "Chưa đăng nhập hoặc phiên đã hết hạn"}, status_code=401)
        perm = auth.required_perm(method, path)
        if perm and perm not in user["perms"]:
            return JSONResponse({"detail": auth.denied_message(perm)}, status_code=403)
    label = auth.action_label(method, path) if user else None
    # Tra tên đối tượng trước khi gọi: xoá xong thì không còn gì để tra.
    target = auth.target_of(path) if label else ""
    tokens = auth.bind(user)
    try:
        response = await call_next(request)
    finally:
        noted = auth.unbind(tokens)
    if label and response.status_code < 400:
        auth.log(label, user=user, target=noted.get("target") or target or auth.target_of(path),
                 method=method, path=path, status=response.status_code,
                 ip=request.client.host if request.client else "")
    return response


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"status": "ok", "indexed_chunks": index.size}


if config.FRONTEND_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=config.FRONTEND_DIR / "static"),
        name="static",
    )

    @app.get("/api/giao-dien/tep", include_in_schema=False)
    def frontend_files() -> dict:
        """Danh sách file giao diện, để trang tự nạp lại khi trình duyệt còn giữ bản cũ."""
        static = config.FRONTEND_DIR / "static"
        return {"files": sorted(f"/static/{p.relative_to(static).as_posix()}"
                                for p in static.rglob("*") if p.suffix in (".js", ".css"))}

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(config.FRONTEND_DIR / "index.html")


def run() -> None:
    import uvicorn

    # Chạy nền trên máy chủ (scripts/chay-may-chu.bat), log ghi ra file: bỏ log
    # từng yêu cầu cho file khỏi phình, vẫn giữ log lỗi. Ai làm gì đã có nhật ký
    # hệ thống trong CSDL.
    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT, reload=False, access_log=False)


if __name__ == "__main__":
    run()
