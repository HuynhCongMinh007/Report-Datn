#!/usr/bin/env bash
# Chạy bộ kiểm thử đơn vị (Mục 5.3.1) — 156 test case trên 11 nhóm service,
# dùng Jest + repository mock, không cần PostgreSQL/Redis/AI Service đang chạy.
#
# Cách dùng:
#   cd backend
#   ./../Report-Datn/KiemThu/01_KiemThuDonVi/run-unit-tests.sh
#
# (hoặc chạy trực tiếp trong thư mục backend/: npm run test:business -- --verbose)

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

npm run test:business -- --verbose
