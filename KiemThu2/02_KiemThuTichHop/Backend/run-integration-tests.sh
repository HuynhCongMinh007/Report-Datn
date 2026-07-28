#!/usr/bin/env bash
# Chạy bộ kiểm thử tích hợp (integration test) Backend (NestJS) — phạm vi
# Phân hệ Quản lý Tài chính: Loans, Finance Alerts (debug/notification
# triggers), Scholarship application lifecycle (student-scholarships +
# scholarships), Admin academic-data (universities/subjects/training-programs).
#
# Khác với kiểm thử đơn vị (01_KiemThuDonVi — service + repository mock) và
# kiểm thử E2E cũ (KiemThu/02_KiemThuAPI_E2E — gọi server + DB thật đang
# chạy), lớp kiểm thử tích hợp này dựng một NestJS TestingModule THẬT cho
# từng controller (guard thật bị override bằng stub đã auth sẵn, ValidationPipe
# + HttpExceptionFilter + TransformInterceptor thật), chỉ mock tầng Service.
# Nhờ vậy nó kiểm chứng được toàn bộ tầng HTTP (routing, DTO validation, RBAC,
# mã lỗi/status code, response envelope) mà không cần PostgreSQL/Redis/AI
# Service đang chạy, và không cần tài khoản thật.
#
# Cách dùng:
#   cd backend
#   ./../Report-Datn/KiemThu2/02_KiemThuTichHop/Backend/run-integration-tests.sh

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

npm run test:integration -- --verbose
