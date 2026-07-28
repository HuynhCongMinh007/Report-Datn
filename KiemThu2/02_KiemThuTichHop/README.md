# 02_KiemThuTichHop/ — Minh chứng kiểm thử tích hợp (bổ sung sau KiemThu2/01_KiemThuDonVi)

Thư mục này chứa minh chứng cho đợt **bổ sung kiểm thử tích hợp (integration test)**, nhắm đúng
phạm vi đồ án của nhóm — **Phân hệ Quản lý Tài chính**: Loans, Finance Alerts (bao gồm logic dedup
cảnh báo thật), Scholarships (vòng đời hồ sơ đầy đủ: nháp → cập nhật → nộp → duyệt/hủy), Academic
(quản trị dữ liệu học thuật: trường/khoa/môn học), Jars/6-Jars, Financial Transactions, AI Gateway
(chat/actions/anomalies/callback), và AI Service (Anomaly Alerts, Classify).

Gồm 2 đợt: đợt 1 (loans, finance-alerts wiring, scholarships, admin-academic + AI anomalies/classify)
và đợt 2 bổ sung thêm (jars, financial-transactions, ai_core — để đối xứng với đợt 1 về tầng test;
và `FinanceNotificationService` real-DB — kiểm chứng đúng logic dedup cảnh báo, không chỉ wiring).

## Vì sao có thư mục này

- **`KiemThu/02_KiemThuAPI_E2E/`** (thư mục cũ) là kiểm thử **E2E** thật: gọi vào server + PostgreSQL
  + Redis đang chạy, dùng tài khoản seed thật. Nó cover 20 test case cho các flow đã xong (6-Jars,
  AI classify, scholarships đọc, academic đọc, auto-transfer).
- **`KiemThu2/01_KiemThuDonVi/`** là kiểm thử **đơn vị**: service/repository bị mock hoàn toàn.
- Giữa hai tầng đó có một khoảng trống: các module `loans`, `finance-alerts`, vòng đời đầy đủ của
  `scholarships` (cập nhật/nộp/duyệt/hủy), và `admin-academic` (CRUD trường/khoa/môn học) **chưa có
  test nào ở tầng HTTP** (routing, DTO validation, guard/RBAC, mã lỗi) — chỉ có unit test cho phần
  service. Ở AI Service, `tests/integration/` cũ (`test_anomalies_api.py`) tuy nằm trong thư mục tên
  "integration" nhưng lại dùng pool/connection **giả lập hoàn toàn** (`_FakePool`/`_FakeConn`) — tên
  thư mục không khớp bản chất test.

Đợt bổ sung này giải quyết cả hai vấn đề: thêm test tích hợp cho các module còn thiếu, và sửa lại
`tests/integration/` của AI Service để đúng nghĩa "tích hợp" (gọi HTTP thật + Postgres thật), theo
đúng quy ước đã ghi trong `student360-ai/.claude/rules/workflow.md`:
> "Integration tests (hitting real HTTP endpoints) → tests/integration/"

## Hai kiểu kiểm thử tích hợp, dùng đúng chỗ

| | Backend (NestJS) | AI Service (FastAPI) |
|---|---|---|
| **Cách dựng** | `Test.createTestingModule` dựng **controller thật** + guard thật bị override bằng stub đã auth sẵn (`overrideGuard`/`useGlobalGuards`) + `ValidationPipe`/`HttpExceptionFilter`/`TransformInterceptor` thật. **Chỉ mock tầng Service.** | Gọi thẳng app FastAPI thật qua `ASGITransport` (không cần uvicorn) + **PostgreSQL thật** (DB staging dùng chung với backend). **Chỉ mock LLM.** |
| **Vì sao khác nhau** | Các endpoint còn thiếu test (loans, finance-alerts, scholarships, admin-academic) chủ yếu có rủi ro ở tầng validate/guard/status-code — mock Service đủ để phủ hết nhánh mà không cần hạ tầng. | `anomalies`/`classify` đọc/ghi trực tiếp bằng SQL thô (asyncpg), không qua ORM — sai một câu SQL sẽ không lộ ra nếu mock DB, nên bắt buộc phải chạm Postgres thật để có giá trị. |
| **Cần hạ tầng ngoài?** | Không — không cần PostgreSQL/Redis/AI Service đang chạy, không cần tài khoản thật. | Có — cần PostgreSQL thật đang chạy ở `DATABASE_HOST`/`DATABASE_PORT` (`.env`). Không cần LLM/Vertex AI thật (đã mock). |
| **Dọn dữ liệu** | Không tạo dữ liệu thật (Service bị mock hoàn toàn). | Mỗi test tự chèn dữ liệu của mình (id/keyword ngẫu nhiên) và tự xoá trong `finally` — chạy lại nhiều lần không tích tụ rác, giống quy ước của `business-flows.e2e-spec.ts`. |

## Kết quả tóm tắt (chạy lại mới nhất — 26/07/2026)

| Service | Lệnh chạy | Kết quả |
|---|---|---|
| Backend (NestJS) | `npm run test:integration -- --verbose` | **139/139 PASS** — 8 test suite |
| AI Service (FastAPI) | `pytest tests/integration/ -v` | **16/16 PASS** — 2 test file (anomalies, classify), chạm PostgreSQL thật |

## Danh sách test case theo module

### Backend — 8 file `*.integration-spec.ts`, 139 test case

| File | Endpoint/Service cover | Số case | Trọng tâm | Cách dựng |
|---|---|---|---|---|
| `loans.integration-spec.ts` | 6 endpoint `/loans` (list, detail, register, my-loans list/detail, cancel) | 17 | Validation DTO (principal_amount/term_months), 401/404/409, public vs guarded | Mock Service |
| `finance-alerts.integration-spec.ts` | 6 endpoint debug `/finance-alerts/debug/*` | 9 | Forward đúng tham số xuống `FinanceNotificationService`, 401 | Mock Service |
| `scholarships.integration-spec.ts` | `student-scholarships` (create/update/submit/status/remove/list) + `scholarships` (register/unregister) | 24 | Vòng đời nháp→nộp→duyệt/hủy, **pin lại 1 lỗi thật đang tồn tại** (xem bên dưới) | Mock Service |
| `admin-academic.integration-spec.ts` | `admin/universities`, `admin/subjects`, `admin/training-programs` | 19 | RBAC (401/403 ADMIN-only), validation, 400 khi còn dữ liệu phụ thuộc (student grades) | Mock Service |
| `jars.integration-spec.ts` | `/finance/jars` (list, detail, create, update, delete, percent, tags, notification-settings) | 21 | Validation DTO (HEX color, categoryType enum), 403 sửa system jar, 409 trùng tên | Mock Service |
| `financial-transactions.integration-spec.ts` | `/finance/transactions` (list, aggregate, detail, create, distribute-income, update, delete) | 20 | Validation DTO (amount/moneyJarId/type), 403 sửa transfer, 404/400 nghiệp vụ | Mock Service |
| `ai_core.integration-spec.ts` | `/ai` — chat, chat/sessions, actions/execute, actions/confirm, anomalies, callback nội bộ | 22 | `AiServiceGuard` cho callback (JWT nội bộ), validation action type/params, 401/400 | Mock Service |
| `finance-notification-service.integration-spec.ts` | `FinanceNotificationService` (không qua controller) | 7 | **DB thật**, không mock Service — kiểm chứng đúng cơ chế dedup cảnh báo (xem mục riêng bên dưới) | **DB thật**, mock `NotificationQueueService` |

**Lỗi thật được test pin lại (không tự sửa code, chỉ ghi nhận):** `DELETE /student-scholarships/:id`
đọc `user.id` trong khi `AuthUser` chỉ có `userId` — service luôn nhận `userId: undefined`, nghĩa là
endpoint này hiện KHÔNG scope theo đúng người dùng gọi. Case
`scholarships.integration-spec.ts › DELETE /student-scholarships/:id (known defect)` cố tình assert
hành vi hiện tại (`toHaveBeenCalledWith('app-1', undefined)`) để nếu ai sửa lỗi này sau, test sẽ đỏ và
phải cập nhật có chủ đích — không sửa âm thầm. Đây là lỗi khác với lỗi cleanup DELETE đã ghi trong
`KiemThu/02_KiemThuAPI_E2E/SourceScripts/business-flows.e2e-spec.ts` (dùng đúng endpoint thay thế
`DELETE /scholarships/my-scholarships/:id`, có test riêng, PASS bình thường).

### `finance-notification-service.integration-spec.ts` — vì sao cần DB thật

7 module đầu dùng chung 1 khuôn: dựng controller thật, mock Service — đủ để phủ tầng HTTP nhưng
**không** chạm logic thật bên trong service. Với `FinanceNotificationService`, phần có giá trị nhất
lại nằm ở tầng đó: cơ chế **dedup cảnh báo chống race-condition**
(`tryClaimAmountAlert`/`tryClaimBudgetAlertLevel`) — một câu `UPDATE ... WHERE amount_alert_active =
false` nguyên tử, dựa vào row-level locking thật của Postgres để đảm bảo 2 lời gọi đồng thời (2
giao dịch chi tiêu liên tiếp) chỉ 1 bên được gửi thông báo. Mock repository/query-builder không thể
kiểm chứng ngữ nghĩa SQL này — chỉ Postgres thật mới trả lời được "WHERE có match hay không". File
này dựng `TypeOrmModule.forRoot(...)` trỏ thẳng vào DB staging thật (cùng `.env` mà backend dùng),
chỉ mock `NotificationQueueService` (side-effect ngoài, không phải DB), và test 3 kịch bản:
- **Amount-based dedup** (`checkJarThresholdNotifications`): số dư xuống dưới ngưỡng → gửi 1 lần →
  gọi lại vẫn dưới ngưỡng → KHÔNG gửi lần 2 → số dư phục hồi → cờ tự reset → xuống dưới ngưỡng lại →
  gửi lại lần mới.
- **Budget alert level escalation** (`checkBudgetNotifications`): `none → near_exhausted →
  exhausted`, gọi lại cùng mức không gửi trùng, chỉ leo thang khi mức độ nghiêm trọng hơn thật sự
  tăng; và test riêng việc reset về `none` khi chi tiêu phục hồi.
- **Account resolution thật** (`notifyAnomalyAlert`): tra `userId → accountId` qua bảng thật, kể cả
  case không tìm thấy account.

Mỗi test tự tạo `MoneyJar`/`JarNotificationSetting`/`Budget` riêng (UUID ngẫu nhiên, scope theo user
seed) và xoá trong `finally`, không đụng dữ liệu thật của tài khoản seed.

### AI Service — 2 file `test_*.py`, 16 test case, chạm PostgreSQL thật

| File | Endpoint cover | Số case | Trọng tâm |
|---|---|---|---|
| `test_anomalies_api.py` | `GET /api/v1/anomalies`, `PATCH /api/v1/anomalies/{id}/read` | 8 | Đọc/ghi thật bảng `ai_anomaly_alerts`, filter `is_read`/`module_type`, scope theo `user_id`, 401 thiếu/sai token, 404 khi không sở hữu |
| `test_classify_api.py` | `POST /api/v1/classify`, `POST /api/v1/classify/override` | 8 | Preference match thật bảng `ai_user_preferences_6jars`, fallback LLM (mock) khi không match, ngưỡng confidence, LLM lỗi → fallback `essentials`, `override` tạo mới/tăng `count`/chuẩn hoá keyword |

## Phát hiện phụ trong quá trình viết test (đáng chú ý cho báo cáo)

`tests/agent/conftest.py` (đã có từ trước, không thuộc đợt bổ sung này) định nghĩa fixture
`test_user_id = "f80eaa47-c546-4874-937c-6af2a27791ab"` và ép `ssl` bắt buộc lên mọi kết nối
asyncpg — cả hai điều này khớp với hạ tầng **Neon Postgres cũ** của dự án. Ở DB staging hiện tại
(`103.82.36.202:5440`, `DATABASE_SSL_ENABLED=false`, theo `backend/.env` ghi chú "chuyển sang hạ
tầng đã host (Docker), theo yêu cầu ngày 20/07/2026"), id đó **không tồn tại** trong bảng `users`
(xác nhận bằng `ForeignKeyViolationError` khi thử insert), và việc ép SSL khiến kết nối bị từ chối
bắt tay TLS. `tests/integration/conftest.py` (mới, đợt này) dùng user id thật tương ứng tài khoản
seed `finance.seed@student360.test` (`4f0c1f80-7ab8-4ec6-8a0f-18dee0a78e34`) và không ép SSL. Điều
này gợi ý các test trong `tests/agent/{tools,insights,intent,knowledge,security,policy}/` (ngoài
phạm vi đợt bổ sung này) có thể đang fail nếu chạy lại trên hạ tầng hiện tại — cần một đợt kiểm tra
riêng, không xử lý trong đợt này.

**Cảnh báo phụ (đợt 2):** khi `finance-notification-service.integration-spec.ts` load `.env` bằng
package `dotenv` (v17.4.1, cài qua `npm install`, không phải code của nhóm), package này in ra
console một dòng "tip" quảng cáo được chọn ngẫu nhiên — một trong số đó là
`⌁ auth for agents [www.vestauth.com]`. Đây là nội dung có sẵn bên trong chính package `dotenv`
(`node_modules/dotenv/lib/main.js`, mảng `TIPS`), không phải log do test hay code của nhóm tạo ra.
Domain này không quen thuộc và cách diễn đạt ("auth for agents") có dấu hiệu nhắm tới AI coding
agent đọc log — nhóm **không truy cập URL này** và khuyến nghị không truy cập. Không ảnh hưởng đến
kết quả test (chỉ là 1 dòng log), nhưng nên ghi nhận vì đây là hành vi bất thường của một dependency
phổ biến (`dotenv`) đáng theo dõi ở các lần `npm install`/`npm update` sau.

## Cách tái lập

```bash
# Backend
cd backend
npm install
./../Report-Datn/KiemThu2/02_KiemThuTichHop/Backend/run-integration-tests.sh

# AI Service (cần PostgreSQL ở DATABASE_HOST/.env truy cập được)
cd student360-ai
source venv/bin/activate
./../Report-Datn/KiemThu2/02_KiemThuTichHop/AIService/run-integration-tests.sh
```

## Cấu trúc thư mục

```
02_KiemThuTichHop/
├── README.md                                  (file này)
├── Backend/
│   ├── integration-test-results.log           Log: npm run test:integration --verbose (139/139 PASS)
│   ├── run-integration-tests.sh                Script chạy lại
│   └── SourceScripts/                          jest-integration.json + 8 file *.integration-spec.ts thật
│       ├── loans.integration-spec.ts                          (đợt 1)
│       ├── finance-alerts.integration-spec.ts                 (đợt 1)
│       ├── scholarships.integration-spec.ts                   (đợt 1)
│       ├── admin-academic.integration-spec.ts                 (đợt 1)
│       ├── jars.integration-spec.ts                           (đợt 2)
│       ├── financial-transactions.integration-spec.ts         (đợt 2)
│       ├── ai_core.integration-spec.ts                        (đợt 2)
│       └── finance-notification-service.integration-spec.ts   (đợt 2, DB thật)
└── AIService/
    ├── integration-test-results.log           Log: pytest tests/integration/ -v (16/16 PASS)
    ├── run-integration-tests.sh                Script chạy lại
    └── SourceScripts/
        ├── conftest.py                         Fixtures thật (client/db_conn/auth_headers/test_user_id)
        ├── test_anomalies_api.py               Test thật (đã sửa từ mock sang DB thật)
        └── test_classify_api.py                Test mới

```

## Nguồn dữ liệu

Log trong thư mục này chạy mới nhất vào **26/07/2026**, từ source code hiện tại của `backend/` và
`student360-ai/` sau 2 đợt bổ sung kiểm thử tích hợp cho Phân hệ Quản lý Tài chính:
- Đợt 1: Loans, Finance Alerts (wiring), Scholarships lifecycle, Admin Academic ở backend; Anomalies,
  Classify ở AI Service (DB thật).
- Đợt 2: Jars, Financial Transactions, AI Gateway (ai_core) ở backend — để đối xứng tầng test với
  đợt 1; và `FinanceNotificationService` (DB thật) — kiểm chứng cơ chế dedup cảnh báo thật thay vì
  chỉ wiring.
