#!/usr/bin/env bash
# Đo coverage kiểm thử đơn vị Backend, giới hạn đúng phạm vi Phân hệ Quản lý Tài
# chính (8 module: jars, financial-transactions, finance-alerts,
# auto-transfer-schedules, ai_core, ai-service-client, loans, scholarships) —
# KHÔNG tính auth/profile/clubs/jobs/... của toàn bộ backend.
#
# Cách dùng:
#   cd backend
#   ./../Report-Datn/KiemThu2/01_KiemThuDonVi/Backend/run-coverage.sh

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

npm run test:cov:finance
