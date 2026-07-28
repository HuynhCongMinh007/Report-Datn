# 06_TuVanAI_Chatbot — Đánh giá tư vấn AI (Chatbot)

**Trạng thái: ĐÃ CHẠY ĐỦ 184/184 câu (local), kết quả 184/184 OK (100%).** Phát hiện 1 lỗi thật
(agent trả lời sai số liệu không nhất quán khi đếm học bổng) — đã xác định nguyên nhân gốc, sửa
code, và xác minh lại ổn định qua nhiều lần chạy. Xem toàn bộ diễn biến, phát hiện, nguyên nhân
gốc, fix, và bảng tổng kết tại `results/summary.md`.

## Bộ câu hỏi — `script/group-06-questions.ts`

184 câu, phủ 28 AI tools đăng ký cho agent tài chính (17 Six Jars + 11 Scholarships): phần lớn
tool có 6 câu biến thể, riêng `get_budget_status` và `get_all_scholarships` có 10 câu/tool (do phát
hiện lỗi ở 2 tool này khi rà soát), cộng 8 câu tổng quát/mơ hồ để kiểm tra khả năng agent tự chọn
tool hợp lý.

File nguồn thật đã sửa trực tiếp tại `backend/test/load/group-06-questions.ts` — file trong
`script/` ở đây là bản copy làm minh chứng.

## Cách chạy lại (tái lập)

Cần backend + AI service đang chạy, và tài khoản seed `finance.seed@student360.test`.

```bash
cd backend

# Chạy theo lô (20 câu/lô) để kiểm soát tốc độ gọi Gemini:
EVAL_USER_EMAIL=finance.seed@student360.test \
EVAL_USER_PASSWORD=<mật khẩu seed> \
BENCH_START=1 BENCH_END=20 \
npx ts-node -r tsconfig-paths/register test/load/group-06-tu-van-ai.ts
# ... lặp lại cho các lô tiếp theo (21-40, 41-60, ..., 181-184)

# Gộp kết quả:
npx ts-node -r tsconfig-paths/register test/load/merge-group-06-results.ts
```

Có thể đổi `E2E_BACKEND_URL` để chạy trên môi trường khác (local mặc định `http://localhost:3000/api`).

## Cấu trúc thư mục

```
06_TuVanAI_Chatbot/
├── README.md                          (file này)
├── script/
│   ├── group-06-questions.ts          184 câu hỏi (bản copy tại thời điểm bổ sung)
│   ├── group-06-tu-van-ai.ts          Script chạy theo lô, đo latency P50/P95/P99
│   └── merge-group-06-results.ts      Gộp kết quả các lô
└── results/
    ├── summary.md                     Log chi tiết từng batch + tổng kết + phát hiện + fix
    ├── fix_get_all_scholarships.diff  Diff code fix đã áp dụng
    ├── local/                         Raw JSON/CSV từng batch (chạy trên local)
    └── hosted-comparison/             Raw JSON/CSV batch đối chiếu chạy trên hosted
```
