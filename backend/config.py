"""Cấu hình ứng dụng, đọc từ biến môi trường / file .env."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
INDEX_DIR = DATA_DIR / "index"
FRONTEND_DIR = BASE_DIR / "frontend"
DB_PATH = DATA_DIR / "huana.db"


def _load_dotenv() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


PLANT_NAME = _env("PLANT_NAME", "Nhà máy Thủy điện Hủa Na")
# Tên in ở đầu phiếu thao tác, lấy theo phiếu đưa phần cơ khí tổ máy H2 ra sửa
# chữa — nhà máy đã chốt đây là cách ghi chuẩn. Vẫn đặt lại được qua .env.
ORG_NAME = _env("ORG_NAME", "CTCP Thủy điện Hủa Na")
ORG_UNIT = _env("ORG_UNIT", "Phân xưởng VH-SC Hủa Na")
HOST = _env("HOST", "0.0.0.0")
PORT = int(_env("PORT", "8000") or 8000)

# Phân hệ 2 — sinh câu trả lời.
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = _env("ANTHROPIC_MODEL", "claude-haiku-4-5")

# Hạn mức gọi mô hình sinh. Chỉ đếm lượt thực sự gọi ra dịch vụ ngoài; hết hạn
# mức thì hệ thống lùi về chế độ trích lược chứ không khoá tra cứu.
DAILY_ASK_LIMIT = int(_env("DAILY_ASK_LIMIT", "100") or 100)
MONTHLY_ASK_LIMIT = int(_env("MONTHLY_ASK_LIMIT", "3000") or 3000)
# Hạn mức ngày phải sang ngày mới theo giờ nhà máy. SQLite datetime('now') là
# giờ UTC nên nếu dùng thẳng thì hạn mức reset lúc 7 giờ sáng.
TIMEZONE_OFFSET_HOURS = int(_env("TIMEZONE_OFFSET_HOURS", "7") or 7)

# Phân hệ 1 — truy hồi. Mặc định bge-m3 chạy nội bộ qua Ollama: xử lý tiếng Việt
# tốt, không gửi tài liệu ra ngoài. Ollama không chạy thì truy hồi tự lùi về BM25.
EMBEDDING_PROVIDER = _env("EMBEDDING_PROVIDER", "openai_compatible").lower() or "none"
VOYAGE_API_KEY = _env("VOYAGE_API_KEY")
VOYAGE_MODEL = _env("VOYAGE_MODEL", "voyage-3")
OPENAI_BASE_URL = _env("OPENAI_BASE_URL", "http://localhost:11434/v1")
OPENAI_API_KEY = _env("OPENAI_API_KEY")
OPENAI_EMBEDDING_MODEL = _env("OPENAI_EMBEDDING_MODEL", "bge-m3")

# Tham số RAG
CHUNK_SIZE = int(_env("CHUNK_SIZE", "900") or 900)
CHUNK_OVERLAP = int(_env("CHUNK_OVERLAP", "150") or 150)
TOP_K = int(_env("TOP_K", "8") or 8)
MAX_UPLOAD_MB = int(_env("MAX_UPLOAD_MB", "50") or 50)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".xlsx", ".csv"}

for _d in (DATA_DIR, UPLOAD_DIR, INDEX_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def generation_enabled() -> bool:
    return bool(ANTHROPIC_API_KEY)


def embeddings_enabled() -> bool:
    if EMBEDDING_PROVIDER == "voyage":
        return bool(VOYAGE_API_KEY)
    if EMBEDDING_PROVIDER == "openai_compatible":
        return bool(OPENAI_BASE_URL)
    return False
