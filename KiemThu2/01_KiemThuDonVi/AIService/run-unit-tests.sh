#!/usr/bin/env bash
# Chạy bộ kiểm thử đơn vị AI Service (FastAPI, student360-ai) — phạm vi Finance
# (6-Jars, Classify, Insights/Health Score, Scholarship Fit, One-touch Execution).
# Toàn bộ mock LLM/DB (monkeypatch/unittest.mock), KHÔNG cần PostgreSQL/Redis/
# Vertex AI thật, KHÔNG cần tài khoản thật.
#
# Cách dùng:
#   cd student360-ai
#   source venv/bin/activate   # hoặc venv tương ứng của bạn
#   ./../Report-Datn/KiemThu2/01_KiemThuDonVi/AIService/run-unit-tests.sh

set -euo pipefail

if [ ! -f pyproject.toml ] || ! grep -q "student360-ai" pyproject.toml 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục student360-ai/ của Student360." >&2
  exit 1
fi

python -m pytest tests/unit/ tests/agent/insights/test_health_score.py -v
