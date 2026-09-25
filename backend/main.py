"""Điểm khởi động ứng dụng: trợ lý kỹ thuật Nhà máy Thủy điện Hủa Na."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import init_db
from .rag.index import index
from .routers import chat, documents, equipment, forms, incidents, procedures, system, tickets


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

for module in (system, chat, documents, equipment, procedures, incidents, forms, tickets):
    app.include_router(module.router)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"status": "ok", "indexed_chunks": index.size}


if config.FRONTEND_DIR.exists():
    app.mount(
        "/static",
        StaticFiles(directory=config.FRONTEND_DIR / "static"),
        name="static",
    )

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(config.FRONTEND_DIR / "index.html")


def run() -> None:
    import uvicorn

    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT, reload=False)


if __name__ == "__main__":
    run()
