# KiemThu/ — Minh chứng kiểm thử hệ thống (Mục 5.3 & 5.4)

Thư mục này chứa toàn bộ minh chứng, log gốc, script gốc từ source, script tái lập, và bảng đặc tả
test case cho:

- **Mục 5.3 — Kiểm thử hệ thống** (`Chapter5/chapter5.tex`, `\section{Kiểm thử hệ thống}`)
  - 5.3.1 Kiểm thử đơn vị → `01_KiemThuDonVi/`
  - 5.3.2 Kiểm thử API → `02_KiemThuAPI_E2E/`
- **Mục 5.4 — Đánh giá hiệu năng** (bảng SLO `tab:api-performance-slo`) → `03_DanhGiaHieuNang/`
  (gồm benchmark nhiều lần) và `04_KiemThuTai_BullMQ/`

## Đọc nhanh (bắt đầu từ đâu)

1. **`BienBanKiemThu_Muc5.3.docx`** — biên bản tổng hợp đầy đủ (đọc trước tiên): Mục 5.3 (kiểm thử
   đơn vị/API) và Mục 5.4 (hiệu năng theo 7 nhóm Bảng 5.1, TB/P50/P95/P99).
2. **`BangDacTa_KiemThu_MucTieu5.3-5.4.xlsx`** — bảng chi tiết (6 sheet): `TongHop`,
   `KiemThu_DonVi` (156 test case), `KiemThu_API_E2E` (20 test case), `DanhGiaHieuNang` (7 nhóm),
   `BullMQ_5LanDo`, `TuVanAI_Coverage28Tools`.
3. **`03_DanhGiaHieuNang/KET_QUA_DANH_GIA_MOI.md`** — bản chi tiết nhất của Mục 5.4, kèm dữ liệu
   thô từng nhóm.
4. **`03_DanhGiaHieuNang/06_TuVanAI_Chatbot/COVERAGE_28_TOOLS.md`** — xác minh độ phủ 28 AI tools
   qua 114 câu hỏi (20/28 xác nhận rõ, 5/28 nghi ngờ agent route sai tool).
5. Ảnh chụp gốc: `../images/chapter5/H5.24.png` (unit test), `H5.25.png` (API/E2E test).

## ⚠️ Cần xử lý trước khi nộp/bảo vệ

1. **BullMQ lệch ~100–470 lần so với báo cáo, ở 5 lần đo độc lập** (2 môi trường) — không phải
   nhiễu ngẫu nhiên, không phải do khoảng cách mạng tới DB (đã loại trừ bằng phép đo hosted).
2. **Nhóm Tư vấn AI (Chatbot)**: TB đo được ~10s (báo cáo 4.05s), P95 ~40s (báo cáo 11.38s), qua
   114 câu hỏi trên backend hosted. Tỉ lệ lỗi 3.5%.
3. **5/28 AI tools không xác nhận được đã hoạt động đúng** khi test có chủ đích — đáng chú ý nhất:
   `get_budget_status` trả lỗi generic, và 3 tool "gợi ý học bổng theo hồ sơ tuỳ ý" có dấu hiệu bị
   agent gộp chung xử lý thay vì phân biệt. Xem `06_TuVanAI_Chatbot/COVERAGE_28_TOOLS.md`.
4. Nhóm CRUD, Search, Ứng tuyển học bổng, Matching đều khớp tốt hoặc nhanh hơn báo cáo — không cần
   xử lý.

## Cấu trúc thư mục

```
KiemThu/
├── README.md                                 (file này)
├── BienBanKiemThu_Muc5.3.docx                 Biên bản tổng hợp
├── BangDacTa_KiemThu_MucTieu5.3-5.4.xlsx      Bảng đặc tả test case + hiệu năng (6 sheet)
├── 01_KiemThuDonVi/
│   ├── unit-test-results.log                  Log: npm run test:business (156/156 PASS)
│   ├── run-unit-tests.sh                      Script chạy lại
│   └── SourceScripts/                         11 file *.spec.ts thật, copy từ backend/src
├── 02_KiemThuAPI_E2E/
│   ├── e2e-test-results.log                   Log: npm run test:e2e (20/20 PASS)
│   ├── run-e2e-tests.sh                       Script chạy lại
│   └── SourceScripts/                         3 file *.e2e-spec.ts + jest-e2e.json thật
├── 03_DanhGiaHieuNang/
│   ├── KET_QUA_DANH_GIA_MOI.md                 ⭐ Bảng kết quả mới nhất, theo 7 nhóm Bảng 5.1
│   ├── 01_CRUD_CoBan/                          script/ + results/ (100 request, hosted)
│   ├── 02_TimKiemLoc/                          script/ + results/ (100 request, hosted)
│   ├── 03_UngTuyenHocBong/                     script/ + results/ (100 request, hosted)
│   ├── 04_PhanLoaiGiaoDich_LLM/                script/ + results/ (100 request, delay, hosted)
│   ├── 05_GoiYHocBong_Matching/                script/ + results/ (100 request, delay, hosted)
│   ├── 06_TuVanAI_Chatbot/                     script/ + results/ (114 câu, delay, hosted) +
│   │                                            COVERAGE_28_TOOLS.md
│   ├── 07_HangDoiThongBao_BullMQ/              README.md (tham chiếu 04/05, không nhân bản)
│   └── _archive_benchmark_don_le/              Benchmark đơn lẻ trước đó (lưu trữ tham khảo)
├── 04_KiemThuTai_BullMQ/
│   ├── bullmq-load-test-results.log           Log lần 1 (local, trước restart)
│   ├── run-load-test.sh                       Script chạy lại
│   ├── SourceScripts/                         notification-queue-load-test.ts, cleanup script
│   └── nhieu-lan/
│       ├── run1.log, run2.log, run3.log        3 lần chạy thêm (local, sau restart)
│       └── summary.md                          Tổng hợp 3 lần
└── 05_MoiTruong_Hosted/
    ├── README.md                              So sánh Local vs Hosted
    ├── e2e-test-results-hosted.log            Log E2E nhắm vào s360-api.ygaps.com
    └── bullmq-load-test-results-hosted.log    Log BullMQ nhắm vào s360-api.ygaps.com
```

## Cách tái lập toàn bộ từ đầu

```bash
# 1. Hạ tầng
docker compose -f backend/docker-compose.local.yml up -d db redis   # nếu dùng Docker cho DB/Redis
cd student360-ai && make up && cd ..                                # AI Service (:8001)

# 2. Backend
cd backend
npm install
npm run migration:run
npm run start:dev            # terminal riêng, hoặc chạy nền

# 3. Kiểm thử đơn vị (không cần tài khoản/hạ tầng ngoài)
./../Report-Datn/KiemThu/01_KiemThuDonVi/run-unit-tests.sh

# 4. Kiểm thử API/E2E
EVAL_USER_EMAIL="finance.seed@student360.test" EVAL_USER_PASSWORD="<xem quản lý mật khẩu nội bộ>" \
  ./../Report-Datn/KiemThu/02_KiemThuAPI_E2E/run-e2e-tests.sh

# 5. Đánh giá hiệu năng theo 7 nhóm Bảng 5.1 (script riêng từng nhóm, xem 03_DanhGiaHieuNang/*/script/)
EVAL_USER_EMAIL="finance.seed@student360.test" EVAL_USER_PASSWORD="<...>" \
E2E_BACKEND_URL="https://s360-api.ygaps.com/api" \
  npx ts-node -r tsconfig-paths/register test/load/group-01-crud-co-ban.ts
# (tương tự cho group-02 đến group-06; nhóm AI dùng thêm BENCH_DELAY_MS để tránh vượt rate limit)

# 6. Kiểm thử tải BullMQ
EVAL_USER_EMAIL="finance.seed@student360.test" EVAL_USER_PASSWORD="<...>" \
  ./../Report-Datn/KiemThu/04_KiemThuTai_BullMQ/run-load-test.sh
```

> Mật khẩu tài khoản test **không được lưu trong repo này** (kể cả repo private) — truyền qua biến
> môi trường khi chạy. Tài khoản `finance.seed@student360.test` là tài khoản seed dùng riêng cho
> mục đích kiểm thử tài chính/học thuật, không phải tài khoản sinh viên thật.

## Nguồn dữ liệu

Toàn bộ log trong thư mục này chạy mới nhất vào **20/07/2026** từ source code hiện tại của
`backend/` (nhánh `staging`), sau khi đã sửa 2 test case bị lỗi thời (`finance-notification
.service.spec.ts`, `financial-transactions.service.spec.ts`) để khớp tính năng dedup cảnh báo
ngân sách mới thêm, và sau khi thêm script benchmark nhiều lần mới
(`backend/test/load/performance-benchmark.ts`) — xem lịch sử commit backend để biết chi tiết.
