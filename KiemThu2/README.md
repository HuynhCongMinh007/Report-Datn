# KiemThu2/ — Minh chứng kiểm thử bổ sung (Phân hệ Quản lý Tài chính)

Thư mục này chứa minh chứng cho phần **bổ sung kiểm thử** thực hiện thêm sau `KiemThu/`, cho đúng
phạm vi đồ án của nhóm — **Phân hệ Quản lý Tài chính**: Jars/6-Jars, Giao dịch tài chính (Financial
Transactions), Ngân sách (Budget), Học bổng (Scholarships), Khoản vay (Loans), Cảnh báo tài chính
(Finance Alerts) — trên cả hai service **Backend (NestJS)** và **AI Service (FastAPI,
student360-ai)**.

- **`01_KiemThuDonVi/`** — kiểm thử **đơn vị** (tương đương mục 5.3.1 trong `KiemThu/`): service/
  repository/LLM/DB đều bị mock hoàn toàn, không cần hạ tầng ngoài.
- **`02_KiemThuTichHop/`**, **`03_DanhGiaAI/`** — các đợt kiểm thử khác (tích hợp, đánh giá AI) —
  xem README riêng trong từng thư mục đó.

Không bao gồm E2E/hiệu năng/tải; các mục đó xem `KiemThu/02_KiemThuAPI_E2E/`,
`KiemThu/03_DanhGiaHieuNang/`, `KiemThu/04_KiemThuTai_BullMQ/`.

## Kết quả (01_KiemThuDonVi — kiểm thử đơn vị)

| Service | Lệnh chạy | Kết quả |
|---|---|---|
| Backend (NestJS) | `npm run test:business -- --verbose` | **879/879 PASS** — 48 test suite |
| AI Service (FastAPI) | `pytest tests/unit/ tests/agent/insights/test_health_score.py -v` | **95/95 PASS** — 8 file test |

**Không có test nào fail** — không có báo cáo phân tích nguyên nhân lỗi vì không phát sinh trường hợp nào.

### Coverage (Backend, chỉ tính 8 module Finance — không tính toàn bộ backend)

Đo bằng `npm run test:cov:finance` (scope: `jars`, `financial-transactions`, `finance-alerts`,
`auto-transfer-schedules`, `ai_core`, `ai-service-client`, `loans`, `scholarships`):

| Metric | % |
|---|---|
| Statements | **83.31%** |
| Lines | **84.41%** |
| Functions | 76.88% |
| Branch | **70.07%** |

Theo module: `jars` (service+repository) đã nâng đáng kể nhờ bổ sung test cho
`jars.repository.ts` (createJar, findUserJarByIdOrCode, upsertNotificationSetting...) và
`finance-insight.repository.ts` (0% → 100%, trước đó chưa có test); `ai_core` từ 45.79% → 67%+
nhờ bổ sung test cho scholarship-fit-analysis, scholarship-recommendations, classify/insights
proxy, anomaly alerts; `financial-transactions`, `auto-transfer-schedules`, `finance-alerts`,
`scholarships`, `loans` đều được bổ sung thêm nhánh (branch) chưa test — đặc biệt
`student-scholarships.service.ts` (luồng `registerScholarship` — lưu hồ sơ cá nhân/học vụ,
cập nhật hồ sơ cũ, audit log) và `get-loans.dto.ts` (transform filter, trước đó 0%).
Chi tiết đầy đủ từng file: `Backend/coverage-report.log`.

## Không cần tài khoản/hạ tầng ngoài

Toàn bộ 974 test case (879 backend + 95 AI service) đều dùng **mock** (repository mock, LLM mock,
`monkeypatch`/`unittest.mock` cho DB) — **không kết nối PostgreSQL/Redis/Vertex AI thật, không cần
tài khoản đăng nhập thật**. Tài khoản seed `finance.seed@student360.test` (dùng cho E2E/hiệu năng ở
`KiemThu/`) **không cần dùng ở đây** — đúng như ghi chú gốc trong `KiemThu/README.md`: "Mục 5.3.1
Kiểm thử đơn vị ... không cần tài khoản/hạ tầng ngoài".

## Cấu trúc thư mục

```
KiemThu2/
├── README.md                                  (file này)
├── 01_KiemThuDonVi/
│   ├── Backend/
│   │   ├── unit-test-results.log              Log: npm run test:business --verbose (879/879 PASS)
│   │   ├── coverage-report.log                 Log: npm run test:cov:finance (83.31% stmt / 70.07% branch)
│   │   ├── run-unit-tests.sh                   Script chạy lại test
│   │   ├── run-coverage.sh                     Script chạy lại coverage
│   │   └── SourceScripts/                      48 file *.spec.ts thật, copy từ backend/src,
│   │                                             giữ nguyên cấu trúc thư mục module gốc
│   └── AIService/
│       ├── unit-test-results.log              Log: pytest tests/unit/ + test_health_score.py (95/95 PASS)
│       ├── run-unit-tests.sh                   Script chạy lại
│       └── SourceScripts/
│           ├── unit/                           7 file tests/unit/*.py thật
│           └── agent/insights/                 test_health_score.py (unit test thuần, chỉ đặt
│                                                 trong tests/agent/insights/ theo quy ước thư mục
│                                                 có sẵn của repo, không phải test hành vi agent)
├── 02_KiemThuTichHop/                          Xem README.md riêng trong thư mục này
└── 03_DanhGiaAI/                               Xem README.md riêng trong thư mục này
```

## Danh sách 48 file spec.ts (Backend) theo module

| Module | Số file | Ghi chú |
|---|---|---|
| `jars` (+ `ai_integration`) | 10 | service, controller, mapper, validators, repository, jars-ai controller, anomaly job, classify service + DTO, **finance-insight repository (mới)** |
| `financial-transactions` | 3 | service, controller, repository |
| `finance-alerts` | 2 | notification service, debug controller |
| `auto-transfer-schedules` | 5 | service, processor, queue service, controller, repository |
| `ai_core` | 3 | service, controller, chat-request DTO |
| `loans` | 5 | service, controller, mapper, repository, **get-loans DTO (mới)** |
| `scholarships` | 18 | 7 service, 7 controller, 4 repository (categories/documents/requirements/reviews/scholarships/student-scholarships/student-scholarship-documents) |
| `academic` | 2 | admin-academic, student-academic (giữ trong `test:business` cho tương thích ngược, không thuộc phạm vi đồ án) |

## Danh sách 8 file test.py (AI Service)

| File | Phạm vi |
|---|---|
| `test_action_budget_tags.py` | Gắn tag ngân sách cho hành động AI |
| `test_action_intent_detector.py` | Nhận diện ý định hành động (one-touch execution) |
| `test_anomaly_worker.py` | Worker phát hiện bất thường chi tiêu (mock DB pool) |
| `test_chat_synthesis_fallback.py` | Tổng hợp câu trả lời chat khi tool trả dữ liệu thô |
| `test_classify_api.py` | `/api/v1/classify` — ưu tiên preference, ngưỡng confidence, fallback lỗi LLM, `_pick_tag` |
| `test_one_touch_execution.py` | Luồng thực thi một chạm qua chat stream |
| `test_scholarship_fit_analysis.py` | Phân tích độ phù hợp học bổng |
| `agent/insights/test_health_score.py` | Công thức tính điểm sức khỏe tài chính: expense_ratio, anomaly `danger` (-20), cap trừ điểm `warning` (-20) |

## Cách tái lập

```bash
# Backend
cd backend
npm install
./../Report-Datn/KiemThu2/01_KiemThuDonVi/Backend/run-unit-tests.sh   # chạy test
./../Report-Datn/KiemThu2/01_KiemThuDonVi/Backend/run-coverage.sh     # đo coverage

# AI Service
cd student360-ai
source venv/bin/activate   # hoặc venv tương ứng
./../Report-Datn/KiemThu2/01_KiemThuDonVi/AIService/run-unit-tests.sh
```

## Nguồn dữ liệu

Log trong `01_KiemThuDonVi/` chạy mới nhất vào **28/07/2026**, từ source code hiện tại của
`backend/` và `student360-ai/`, phạm vi Phân hệ Quản lý Tài chính (Jars, Financial Transactions,
Budget, Scholarships, Loans, Finance Alerts, AI Core).
