#!/usr/bin/env bash
# Chạy bộ kiểm thử tích hợp API/E2E (Mục 5.3.2) — Jest + Supertest, gọi thật
# vào Backend + AI Service + PostgreSQL + Redis đang chạy, xác thực bằng
# Bearer token của một tài khoản có thật.
#
# YÊU CẦU TRƯỚC KHI CHẠY:
#   1. PostgreSQL + Redis đang chạy và Backend kết nối được tới chúng.
#   2. Backend đang chạy (npm run start:dev, mặc định http://localhost:3000/api).
#   3. AI Service đang chạy (cd student360-ai && make up, mặc định http://localhost:8001).
#   4. Một tài khoản test có sẵn 6 hũ hệ thống, dữ liệu học bổng/học thuật cơ bản.
#
# Cách dùng:
#   EVAL_USER_EMAIL="..." EVAL_USER_PASSWORD="..." \
#     ./run-e2e-tests.sh
#
# Bộ test dùng làm minh chứng cho Mục 5.3.2 chỉ gồm 3 spec (khớp Hình 5.25):
# ai-gateway, business-flows, jobs-anon. Các spec HR/web-admin khác trong
# test/ (applications-submit, hr-candidate-chat, hr-interviews) nằm ngoài
# phạm vi Mục 3.2 nên không chạy ở đây.

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

if [ -z "${EVAL_USER_EMAIL:-}" ] || [ -z "${EVAL_USER_PASSWORD:-}" ]; then
  echo "Thiếu EVAL_USER_EMAIL / EVAL_USER_PASSWORD." >&2
  echo "Ví dụ: EVAL_USER_EMAIL=finance.seed@student360.test EVAL_USER_PASSWORD='...' ./run-e2e-tests.sh" >&2
  exit 1
fi

npm run test:e2e -- --testPathPattern="(ai-gateway|business-flows|jobs-anon)\.e2e-spec\.ts" --verbose
