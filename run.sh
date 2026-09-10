#!/usr/bin/env bash
# Khởi động hệ thống trợ lý kỹ thuật NMTĐ Hủa Na.
set -euo pipefail

cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"

if [ ! -d .venv ]; then
  echo "==> Tạo môi trường ảo .venv"
  "$PYTHON" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Cài đặt thư viện"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

if [ ! -f data/huana.db ]; then
  echo "==> Nạp dữ liệu mẫu Nhà máy Thủy điện Hủa Na"
  python -m backend.seed
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo "==> Máy chủ chạy tại http://localhost:${PORT}"
echo "    Tài liệu API: http://localhost:${PORT}/docs"
exec uvicorn backend.main:app --host "$HOST" --port "$PORT"
