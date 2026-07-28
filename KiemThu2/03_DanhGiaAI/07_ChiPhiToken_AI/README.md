# 07_ChiPhiToken_AI — Đo Token & Chi phí AI

**Trạng thái: đã chạy xong 62/62 câu (subset), kết quả trong `results/summary.md`.**

Mục này đo lượng token vào/ra và chi phí ước tính (VND) của chatbot 6-Jars, phục vụ phần "đánh giá
chi phí AI" của báo cáo DATN. Khác với `06_TuVanAI_Chatbot/` (đo chất lượng trả lời + latency),
mục này chỉ tập trung vào token/chi phí.

## Điều kiện tiên quyết: pipeline capture-token → tính cost → ghi log

Trước khi đo được số liệu này, hệ thống **chưa có** cơ chế nào ghi nhận token/chi phí AI thực tế:
bảng `ai_usage_logs` (backend) tồn tại từ trước nhưng không có service nào ghi vào, và provider
Vertex AI REST tự viết (`student360-ai/app/core/llm/providers/vertexai.py`) chưa từng đọc field
`usageMetadata` mà Gemini trả về. Đã bổ sung:

- `student360-ai/app/core/llm/pricing.py` — bảng giá VND/token cho `gemini-2.5-pro`, lấy từ bảng
  giá SKU chính thức của Vertex AI (GCP Billing, snapshot **2026-07-28**, tier ngữ cảnh ≤200K
  token): input 32.874,374627484 VND/1M token, output 262.994,997019872 VND/1M token.
- `vertexai.py::_extract_ai_message` — vá để đọc `usageMetadata` (promptTokenCount /
  candidatesTokenCount) từ response Gemini và gắn vào `AIMessage.usage_metadata`.
- `react_loop.py` — cộng dồn token qua **mọi** lượt gọi LLM thật trong 1 turn (vòng ReAct có thể
  gọi LLM nhiều lần: tool-calling + trả lời cuối + các lượt retry one-tap-action), thay vì chỉ đọc
  token của message cuối (tránh đếm thiếu).
- Backend (`ai.service.ts`) ghi 1 dòng vào `ai_usage_logs` (có `cost_vnd`) sau mỗi lượt chat, cả
  `/ai/chat` (non-stream) và `/ai/chat/stream`. Migration
  `1785000000000-AddCostVndToAiUsageLog.ts` thêm cột `cost_vnd`.

## Bộ câu hỏi — subset từ `group-06-questions.ts`

Không tạo dataset mới. Lấy `QUESTIONS` (184 câu, phủ 28 AI tools — xem
`06_TuVanAI_Chatbot/README.md`) và lọc **mọi câu tại index chia hết cho 3** (0-based, xem
`group-07-token-cost.ts`) → **62 câu**, rải đều theo mọi block tool (tool 6-câu còn ~2 câu, 2 tool
10-câu có lịch sử lỗi timeout — `get_budget_status`, `get_all_scholarships` — còn ~3-4 câu, 8 câu
tổng quát/mơ hồ còn 3 câu). Quy tắc tái lập được bằng công thức, không cần chọn tay từng câu; nếu
`group-06-questions.ts` được cập nhật thêm câu, subset này tự đổi theo.

## Tài khoản & môi trường dùng để test

- Tài khoản: `finance.seed@student360.test` (giống các mục 04/05/06).
- Môi trường: **local** — backend chạy `npm run start:dev` local, AI service chạy trong Docker
  (`docker compose up -d`, đã `restart ai-service` sau khi vá `vertexai.py`), DB Postgres dùng
  chung với host remote `103.82.36.202:5440` (cấu hình sẵn trong `backend/.env`).

## Cách chạy lại

```bash
cd backend

EVAL_USER_EMAIL=finance.seed@student360.test \
EVAL_USER_PASSWORD=<mật khẩu seed> \
BENCH_DELAY_MS=3000 \
npx ts-node -r tsconfig-paths/register test/load/group-07-token-cost.ts

# Gộp kết quả (hỗ trợ nhiều file lô nếu chạy BENCH_START/BENCH_END theo từng đợt):
BENCH_OUT_DIR=test/load/group-07-results \
npx ts-node -r tsconfig-paths/register test/load/merge-group-07-results.ts
```

File nguồn thật nằm ở `backend/test/load/group-07-token-cost.ts` và
`backend/test/load/merge-group-07-results.ts` — file trong `script/` ở đây là bản copy tại thời
điểm chạy, dùng làm minh chứng.

## Kết quả tóm tắt (62/62 câu, xem đầy đủ ở `results/summary.md`)

- Tổng tokens vào: **816.923** — Tổng tokens ra: **11.051**
- Tổng chi phí ước tính: **29.762,19 VND** cho 62 lượt chat (TB **480,04 VND/lượt**)
- TB tokens vào/lượt: **13.176** — TB tokens ra/lượt: **178**

**Phát hiện đáng chú ý:** `get_all_scholarships` tốn token vào cao vượt trội (TB **58.034
tokens/lượt**, gấp ~4.4 lần trung bình chung) — do tool trả nguyên danh sách học bổng dạng JSON vào
context. Đây là driver chi phí lớn nhất trong toàn bộ 28 tool, đáng cân nhắc tối ưu (tóm tắt/rút gọn
kết quả tool trước khi đưa vào context) nếu muốn giảm chi phí vận hành.

**4 câu hỏi có chi phí = 0** (`get_scholarship_recommendations_for_described_profile`,
`match_scholarships_for_profile` một phần, `search_scholarship_recommendations_by_criteria` một
phần) — không phải lỗi: các câu này rơi vào nhánh "gợi ý học bổng trực tiếp"
(`_run_direct_scholarship_recommendation` trong `agent.py`) trả lời thẳng từ kết quả tool, không
gọi LLM, nên không phát sinh token/chi phí. Backend cũng chủ động không ghi các lượt này vào
`ai_usage_logs` (guard `if (!tokensIn && !tokensOut) return` trong `logAiUsage()`), nên số dòng
trong DB (58) ít hơn tổng số câu hỏi (62) — **đã đối chiếu khớp tuyệt đối** giữa `summary.md` và
truy vấn trực tiếp `ai_usage_logs` (58 dòng, tổng tokens/cost trùng khớp 100%).

Bảng ước tính chi phí ở quy mô (ngoại suy tuyến tính từ chi phí TB/lượt đo được, xem chi tiết trong
`results/summary.md`) — **đây là ngoại suy, không phải đo thực tế ở quy mô lớn**:

| Giả định tin nhắn/user/tháng | Chi phí ước tính/user/tháng (VND) |
|---|---|
| 5 | 2.400 |
| 20 | 9.601 |
| 60 | 28.802 |

## Giới hạn đã biết

- Chưa tính chi phí các lệnh gọi LLM phụ trong turn (intent classifier, action-intent detector,
  tool-refusal judge, action extractor — mỗi cái là 1 lệnh gọi LLM riêng, dùng model khác) — số liệu
  đo được là **cận dưới** của chi phí thực, không phải tổng chi phí tuyệt đối.
- Giá áp dụng cho tier ngữ cảnh ≤200K token của Gemini 2.5 Pro trên Vertex AI — hội thoại 6-Jars
  luôn nằm dưới ngưỡng này nên không ảnh hưởng, nhưng cần re-check nếu GCP đổi giá hoặc đổi model.
- `targetTool` trong câu hỏi là "dự định kích hoạt", không đảm bảo model luôn gọi đúng tool đó (cùng
  lưu ý đã có ở `06_TuVanAI_Chatbot`).
- Bảng "ước tính chi phí ở quy mô" là ngoại suy tuyến tính đơn giản từ chi phí TB/lượt đo trên 62
  câu — không tính đến cache, batching, hay thay đổi hành vi người dùng thực tế ở quy mô lớn.

## Cấu trúc thư mục

```
07_ChiPhiToken_AI/
├── README.md                          (file này)
├── script/
│   ├── group-07-token-cost.ts         Script chạy subset 62 câu, gọi POST /ai/chat, ghi token/cost
│   └── merge-group-07-results.ts      Gộp kết quả các lô + tính bảng ước tính chi phí ở quy mô
└── results/
    ├── raw-batch-001-062-*.json/csv   Kết quả chi tiết từng câu (62 câu)
    ├── all-merged.json                Bản gộp (giống raw vì chỉ chạy 1 lô)
    └── summary.md                     Bảng tổng hợp chính — dùng số liệu này cho báo cáo DATN
```
