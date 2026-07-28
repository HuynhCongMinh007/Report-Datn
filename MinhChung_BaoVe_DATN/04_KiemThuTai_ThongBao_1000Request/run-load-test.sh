#!/usr/bin/env bash
# Kiểm thử tải hàng đợi thông báo BullMQ/Redis: bắn N request thật tới
# POST /notification-queue/send-queued (mỗi request là 1 INSERT DB thật +
# 1 job đẩy vào Redis/BullMQ thật), đo độ trễ enqueue P50/P95/P99 và
# throughput. Không gửi push thật vì tài khoản test không có thiết bị
# đăng ký (xem chú thích trong test/load/notification-queue-load-test.ts).
#
# YÊU CẦU: Backend + PostgreSQL + Redis đang chạy.
#
# Cách dùng:
#   EVAL_USER_EMAIL="..." EVAL_USER_PASSWORD="..." \
#     LOAD_TEST_COUNT=1000 LOAD_TEST_CONCURRENCY=10 \
#     ./run-load-test.sh
#
# Mặc định COUNT=1000, CONCURRENCY=10 (khớp thông số "1.000 request,
# concurrency = 10" trích trong Bảng hiệu năng, Mục 5.4).
#
# Nếu cần dừng giữa chừng / dọn job còn sót trong hàng đợi:
#   npx ts-node -r tsconfig-paths/register test/load/cleanup-load-test-jobs.ts

set -euo pipefail

if [ ! -f package.json ] || ! grep -q "nestjs-student-api" package.json 2>/dev/null; then
  echo "Hãy chạy script này từ thư mục backend/ của Student360." >&2
  exit 1
fi

if [ -z "${EVAL_USER_EMAIL:-}" ] || [ -z "${EVAL_USER_PASSWORD:-}" ]; then
  echo "Thiếu EVAL_USER_EMAIL / EVAL_USER_PASSWORD." >&2
  exit 1
fi

export LOAD_TEST_COUNT="${LOAD_TEST_COUNT:-1000}"
export LOAD_TEST_CONCURRENCY="${LOAD_TEST_CONCURRENCY:-10}"

npx ts-node -r tsconfig-paths/register test/load/notification-queue-load-test.ts
