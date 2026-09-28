"""Điểm khởi động ứng dụng: trợ lý kỹ thuật Nhà máy Thủy điện Hủa Na."""
from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import init_db
from .rag.index import index
from .routers import chat, documents, equipment, forms, incidents, procedures, system, journal, ptt


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

for module in (system, chat, documents, equipment, procedures, incidents, forms, journal, ptt):
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

    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT, reload=False)


if __name__ == "__main__":
    run()
