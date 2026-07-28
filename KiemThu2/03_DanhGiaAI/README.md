# KiemThu2/03_DanhGiaAI/ — Minh chứng mở rộng đánh giá độ chính xác AI

Thư mục này chứa minh chứng đánh giá độ chính xác/chất lượng AI (phân loại giao dịch, gợi ý học
bổng, tư vấn chatbot) — thay thế hoàn toàn số liệu cũ, không dùng làm căn cứ. Bộ dữ liệu gốc chỉ có
**15 mẫu/hũ (90 mẫu tổng)** — cỡ mẫu quá nhỏ để kết luận đáng tin cậy (sai số biên ước tính ~15% ở
mức tin cậy 95%) — nên đã mở rộng như dưới đây.

## Thay đổi cho phân loại giao dịch

- Bộ dữ liệu `classification_eval_set.json` (`student360-ai/tests/eval/data/`) được mở rộng từ
  **90 → 300 mẫu** (50 mẫu/hũ × 6 hũ), giữ nguyên định dạng và 90 mẫu gốc (id `*-01` đến `*-15`),
  chỉ thêm mới 35 mẫu/hũ (id `*-16` đến `*-50`).
- Script `eval_classification.py` được thêm biến môi trường `EVAL_DATASET_PATH` để có thể chạy
  **theo từng batch nhỏ (mỗi hũ 50 mẫu)** thay vì chạy toàn bộ 300 mẫu một lần — theo yêu cầu kiểm
  soát tốc độ gọi Gemini API để tránh bị giới hạn tần suất (rate limit). Cơ chế giãn cách gốc của
  script (delay 4 giây/request, chạy tuần tự `concurrency=1`, tự động retry với backoff khi gặp lỗi
  429) được giữ nguyên không đổi.
- Đã sửa một lỗi nhỏ trong script (dùng `Path.relative_to` gây crash khi dataset nằm ngoài thư mục
  dự án) — không ảnh hưởng đến kết quả đo, chỉ ảnh hưởng bước lưu file JSON báo cáo.

## Tài khoản dùng để test

`finance.seed@student360.test` — tài khoản seed sẵn có của hệ thống.

## Cách chạy lại (theo batch, để kiểm soát nhịp gọi AI)

```bash
cd student360-ai
source venv/bin/activate  # hoặc ./venv/bin/python3 trực tiếp

# Tách dataset đầy đủ (300 mẫu) thành 6 file, mỗi file 50 mẫu/hũ — xem script tách trong
# results/batch-XX-<jar>/dataset-used.json (đã tách sẵn, có thể tái tạo bằng cách lọc theo
# expected_jar từ data/classification_eval_set_v2_300.json)

EVAL_USER_EMAIL="finance.seed@student360.test" \
EVAL_USER_PASSWORD="<mật khẩu seed>" \
EVAL_DATASET_PATH="<đường dẫn tới file batch 50 mẫu>" \
python3 -u tests/eval/eval_classification.py
```

## Gợi ý học bổng và tư vấn chatbot

Bổ sung thêm 2 mục để đánh giá độ chính xác/chất lượng (không chỉ độ trễ):

- **`05_GoiYHocBong_Matching/`** — **đã chạy xong**. Mở rộng dữ liệu lên 30 hồ sơ / 36 học bổng,
  đo cả công thức matching (`_score_profile_match`, 96.7% top-1) lẫn pipeline production đầy đủ có
  gate + sort (`_rank_recommendation_items`, 53.3% top-1) — phát hiện chênh lệch đáng kể giữa 2
  tầng do bước sắp xếp cuối ưu tiên GPA-gap/amount hơn mức liên quan chủ đề. Chi tiết:
  `05_GoiYHocBong_Matching/results/summary.md`.
- **`06_TuVanAI_Chatbot/`** — **đã chạy xong đủ 184/184 câu, 100% thành công**. Mở rộng bộ câu hỏi
  từ 114 lên 184 câu. Phát hiện 1 lỗi thật: agent trả lời **sai số liệu không nhất quán** cho câu
  hỏi đếm đơn giản (63 học bổng thật nhưng có lần trả lời "1 học bổng") — nguyên nhân gốc là tool
  `get_all_scholarships` không có trường tổng số độc lập với `limit`; đã sửa code (thêm
  `paging.total_matching`) và xác nhận ổn định qua toàn bộ 184 câu. Chi tiết:
  `06_TuVanAI_Chatbot/results/summary.md`.

- **`07_ChiPhiToken_AI/`** — đo lượng token vào/ra và chi phí ước tính (VND) của chatbot 6-Jars.
  Trước đó hệ thống **không hề ghi nhận** token/chi phí AI thực tế nào (bảng `ai_usage_logs` tồn tại
  từ trước nhưng không có service ghi vào; provider Vertex AI REST tự viết chưa từng đọc
  `usageMetadata` từ response Gemini) — đã bổ sung pipeline capture-token → tính cost → ghi log
  (xem README riêng trong thư mục đó để biết chi tiết các chỗ đã vá). **Đã chạy xong 62/62 câu**
  (subset chọn lọc từ bộ 184 câu của mục 06). Kết quả: tổng **816.923 tokens vào / 11.051 tokens
  ra**, tổng chi phí **29.762,19 VND** cho 62 lượt (TB **480,04 VND/lượt**). Phát hiện đáng chú ý:
  tool `get_all_scholarships` tốn token vào cao gấp ~4.4 lần trung bình chung (trả nguyên JSON danh
  sách học bổng vào context) — driver chi phí lớn nhất trong 28 tool. Đã đối chiếu khớp tuyệt đối
  giữa kết quả script và truy vấn trực tiếp `ai_usage_logs`. Xem chi tiết
  `07_ChiPhiToken_AI/results/summary.md`.

## Cấu trúc thư mục

```
03_DanhGiaAI/
├── README.md                                  (file này)
├── 04_PhanLoaiGiaoDich_LLM/
    ├── script/eval_classification.py          Bản copy script tại thời điểm chạy (đã có fix EVAL_DATASET_PATH)
    ├── data/classification_eval_set_v2_300.json   Bộ dữ liệu đầy đủ 300 mẫu (50/hũ)
    └── results/
        ├── batch-01-essentials/
        │   ├── dataset-used.json              50 mẫu hũ essentials dùng cho batch này
        │   └── console-output.log             Log đầy đủ + ma trận nhầm lẫn của batch
        │                                        (báo cáo JSON lần chạy này bị mất do lỗi script,
        │                                         đã sửa lỗi ngay sau đó — xem ghi chú trong log)
        ├── batch-02-education/
        │   ├── dataset-used.json              50 mẫu hũ education dùng cho batch này
        │   ├── raw-report.json                Báo cáo JSON đầy đủ (per-item, có confidence/source)
        │   └── console-output.log             Log đầy đủ + phân tích mẫu sai
        ├── batch-03-investment/
        │   ├── dataset-used.json              50 mẫu hũ investment dùng cho batch này
        │   ├── raw-report.json                Báo cáo JSON đầy đủ (per-item, có confidence/source)
        │   └── console-output.log             Log đầy đủ (100%, không có mẫu sai)
        ├── batch-04-sharing/
        │   ├── dataset-used.json              50 mẫu hũ sharing dùng cho batch này
        │   ├── raw-report.json                Báo cáo JSON đầy đủ (per-item, có confidence/source)
        │   └── console-output.log             Log đầy đủ (100%, không có mẫu sai)
        ├── batch-05-enjoyment/
        │   ├── dataset-used.json              50 mẫu hũ enjoyment dùng cho batch này
        │   ├── raw-report.json                Báo cáo JSON đầy đủ (per-item, có confidence/source)
        │   └── console-output.log             Log đầy đủ + phân tích mẫu sai (biên education/enjoyment)
        ├── batch-06-reserve/
        │   ├── dataset-used.json              50 mẫu hũ reserve dùng cho batch này
        │   ├── raw-report.json                Báo cáo JSON đầy đủ (per-item, có confidence/source)
        │   └── console-output.log             Log đầy đủ (100%, không có mẫu sai)
        └── summary-N300.md                    Tổng hợp Accuracy/P/R/F1 + ma trận nhầm lẫn N=300
```

## Kết quả tóm tắt theo batch

| Batch | Hũ | N | Đúng | Accuracy | Nhầm sang |
|---|---|---|---|---|---|
| 01 | essentials | 50 | 46 | **92.0%** | 2 → enjoyment, 2 → reserve |
| 02 | education | 50 | 49 | **98.0%** | 1 → enjoyment |
| 03 | investment | 50 | 50 | **100.0%** | (không nhầm) |
| 04 | sharing | 50 | 50 | **100.0%** | (không nhầm) |
| 05 | enjoyment | 50 | 49 | **98.0%** | 1 → education (mẫu biên: "trại hè kỹ năng sống") |
| 06 | reserve | 50 | 50 | **100.0%** | (không nhầm) |
| **Tổng N=300** | — | **300** | **294** | **98.0%** (Macro-F1 98.0%) | xem `summary-N300.md` |

System prompt phân loại (`prompts_classify.py`) mô tả phạm vi hũ `investment` không bao gồm
"tiết kiệm dài hạn" (thuộc đúng `reserve` = LTSS = *Long-Term Saving for Spending* theo đặc tả gốc
6 hũ), giúp mô hình phân biệt rõ giữa hành vi cất giữ an toàn (tiết kiệm) và hành vi sinh lời (đầu
tư). Batch reserve chạy lại trên môi trường local (Backend + AI Service Docker) với cấu hình prompt
hiện tại cho kết quả **50/50 (100.0%)**, không còn nhầm lẫn với `investment`/`education`/`sharing`
như ghi nhận trước đây. Số liệu N=300 ở `summary-N300.md` là số liệu chính thức, nhất quán để đưa
vào Bảng 5.2/5.3 của `Chapter5/chapter5.tex`.
