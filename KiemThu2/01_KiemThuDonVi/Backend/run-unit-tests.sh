#!/usr/bin/env bash
# Chạy bộ kiểm thử đơn vị Backend (NestJS) — phạm vi Phân hệ Quản lý Tài chính
# (Jars/6-Jars, Financial Transactions, Budget, Scholarships, Loans), dùng Jest +
# repository/service mock, KHÔNG cần PostgreSQL/Redis/AI Service đang chạy,
# KHÔNG cần tài khoản thật.
#
# Cách dùng:
#   cd backend
#   ./../Report-Datn/KiemThu2/01_KiemThuDonVi/Backend/run-unit-tests.sh

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

npm run test:business -- --verbose
