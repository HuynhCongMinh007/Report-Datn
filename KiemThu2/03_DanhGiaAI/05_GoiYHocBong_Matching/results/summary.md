# Kết quả chính thức — Gợi ý học bổng (Matching)

Chạy ngày 26/07/2026, local, không cần backend/AI service/tài khoản (2 hàm thuần, đọc thẳng file
JSON `data/scholarship_matching_eval_set.json`, 30 hồ sơ x 36 học bổng).

```bash
cd student360-ai && source venv/bin/activate
python3 tests/eval/eval_scholarship_matching.py
python3 tests/eval/eval_scholarship_ranking_pipeline.py
```

## 1. `eval_scholarship_matching.py` — công thức text-similarity riêng lẻ (`_score_profile_match`)

| Metric | Giá trị |
|---|---|
| Top-1 accuracy | **96.7%** |
| MRR | **0.983** |
| Precision@1 / Recall@1 / F1@1 | 96.7% / 48.3% / 64.4% |
| Precision@3 / Recall@3 / F1@3 | 66.7% / 100.0% / 80.0% |
| Precision@5 / Recall@5 / F1@5 | 40.0% / 100.0% / 57.1% |

→ Công thức fuzzy (Jaccard/Bigram/SequenceMatcher) rất hiệu quả để xếp đúng 2 học bổng "đích danh
đúng ngành" lên đầu danh sách (Recall@3 = 100%: cả 2 học bổng liên quan luôn nằm trong top-3).
Precision giảm dần theo K chỉ vì mỗi hồ sơ chỉ có đúng 2 học bổng "thật sự liên quan" trong tổng 36
— không phải dấu hiệu thuật toán kém.

File chi tiết: `scholarship_matching_eval_20260726_181210.json` (per-hồ-sơ, có matched_terms).

## 2. `eval_scholarship_ranking_pipeline.py` — pipeline production đầy đủ (`_rank_recommendation_items`)

| Metric | Giá trị |
|---|---|
| Độ phủ gate trung bình (avg_gate_coverage) | **100.0%** |
| Top-1 accuracy | **53.3%** |
| MRR | **0.683** |
| Precision@1 / Recall@1 / F1@1 | 53.3% / 26.7% / 35.6% |
| Precision@3 / Recall@3 / F1@3 | 40.0% / 60.0% / 48.0% |
| Precision@5 / Recall@5 / F1@5 | 30.7% / 76.7% / 43.8% |

→ Gate trường+ngành **không loại nhầm** học bổng liên quan nào trong bộ dữ liệu này (gate coverage
100%) — nhưng vì thứ tự cuối cùng sắp theo **GPA-gap nhỏ nhất rồi đến amount cao nhất** (không theo
mức độ liên quan chủ đề), Top-1 accuracy chỉ 53.3% so với 96.7% của công thức text-similarity đơn
thuần.

File chi tiết: `scholarship_ranking_pipeline_eval_20260726_181217.json` (per-hồ-sơ, có
`ranked_ids_after_gate`, `total_survivors_after_gate`).

## Nhận định để đưa vào báo cáo

Có một khoảng cách rõ rệt giữa **"thuật toán tính độ phù hợp"** (rất tốt, 96.7% top-1) và
**"thứ tự sản phẩm thực sự hiển thị cho người dùng"** (53.3% top-1, do bị chi phối bởi tiêu chí
GPA-gap/amount ở bước sắp xếp cuối, không phải do thuật toán matching kém). Đây là phát hiện đáng
nêu ở phần thảo luận/hạn chế: nên cân nhắc đưa match_score (độ liên quan chủ đề) vào làm tiêu chí
sắp xếp chính (hoặc tiêu chí đầu) thay vì chỉ dùng để hiển thị badge %, nếu mục tiêu sản phẩm là
"gợi ý đúng học bổng phù hợp nhất" hơn là "ưu tiên học bổng dễ đậu nhất (GPA sát) + giá trị cao
nhất". Cả hai đều là lựa chọn thiết kế hợp lý — tùy góc nhìn khi viết phần thảo luận.

## Tái lập

Dataset sinh bằng `../script/gen_scholarship_dataset.py` (seed=42, cùng chạy sẽ cho đúng cùng 30
hồ sơ / 36 học bổng / cùng kết quả — đã xác nhận số liệu khớp 100% giữa lần sanity-check lúc viết
script và lần chạy chính thức này).
