#!/usr/bin/env bash
# Chạy bộ kiểm thử tích hợp (integration test) AI Service (FastAPI,
# student360-ai) — phạm vi Anomaly Alerts (GET/PATCH /api/v1/anomalies) và
# Classify (POST /api/v1/classify, /api/v1/classify/override).
#
# Gọi thẳng vào ứng dụng FastAPI thật qua ASGITransport (không cần uvicorn
# đang chạy) và một PostgreSQL THẬT (DB staging cấu hình qua DATABASE_* trong
# .env — cùng DB mà backend/.env trỏ tới). Chỉ có LLM bị mock (không gọi
# Vertex AI/Gemini thật). Mỗi test tự chèn dữ liệu của mình (id/keyword ngẫu
# nhiên, scope theo user seed finance.seed@student360.test) và tự xoá trong
# khối finally, nên chạy lại nhiều lần không tích tụ dữ liệu rác.
#
# YÊU CẦU: PostgreSQL ở DATABASE_HOST/DATABASE_PORT trong .env phải truy cập
# được từ máy chạy script (mặc định trỏ tới DB staging dùng chung với backend).
#
# Cách dùng:
#   cd student360-ai
#   source venv/bin/activate   # hoặc venv tương ứng của bạn
#   ./../Report-Datn/KiemThu2/02_KiemThuTichHop/AIService/run-integration-tests.sh

set -euo pipefail

if [ ! -f pyproject.toml ] || ! grep -q "student360-ai" pyproject.toml 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục student360-ai/ của Student360." >&2
  exit 1
fi

python -m pytest tests/integration/ -v
