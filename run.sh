#!/usr/bin/env bash
# Khởi động hệ thống trợ lý kỹ thuật NMTĐ Hủa Na (Linux / macOS).
set -euo pipefail

cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "[LỖI] Không tìm thấy $PYTHON. Hãy cài Python 3.10 trở lên rồi chạy lại."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "==> Tạo môi trường ảo .venv"
  "$PYTHON" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "==> Cài đặt thư viện (lần đầu có thể mất vài phút)"
# Mạng nội bộ nhà máy thường chậm hoặc qua proxy, nên nới thời gian chờ và cho
# phép thử lại thay vì hỏng ngay từ lần tải đầu tiên.
PIP_OPTS=(--quiet --retries 8 --timeout 180)
if ! python -m pip install "${PIP_OPTS[@]}" --upgrade pip; then
  echo "[CẢNH BÁO] Không nâng cấp được pip, tiếp tục với phiên bản hiện có."
fi
if ! python -m pip install "${PIP_OPTS[@]}" -r requirements.txt; then
  echo
  echo "[LỖI] Tải thư viện thất bại — thường do mạng chậm hoặc bị chặn."
  echo "      Hãy chạy lại ./run.sh (các gói đã tải xong sẽ được dùng lại),"
  echo "      hoặc cấu hình proxy:  export HTTPS_PROXY=http://<proxy>:<cổng>"
  exit 1
fi

if [ ! -f data/huana.db ]; then
  echo "==> Nạp dữ liệu mẫu Nhà máy Thủy điện Hủa Na"
  python -m backend.seed
fi

echo
echo "==> Máy chủ đang chạy. Mở trình duyệt tại:"
echo "      http://localhost:${PORT}"
echo "    Tài liệu API: http://localhost:${PORT}/docs"
echo "    Nhấn Ctrl + C để dừng."
echo
exec python -m uvicorn backend.main:app --host "$HOST" --port "$PORT"
