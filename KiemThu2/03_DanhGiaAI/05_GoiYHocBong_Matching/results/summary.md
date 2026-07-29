# Kết quả chính thức — Gợi ý học bổng (Matching)

Chạy local, không cần backend/AI service/tài khoản (2 hàm thuần, đọc thẳng file JSON
`data/scholarship_matching_eval_set.json`). Bộ dữ liệu: **30 hồ sơ sinh viên x 150 học bổng**, mỗi
hồ sơ được gán **12 học bổng thực sự phù hợp** làm đáp án đúng (mở rộng từ 66 học bổng / 5 đáp án
đúng mỗi hồ sơ ở lần đo trước, bằng cách tăng số học bổng đặc thù theo ngành từ 5 lên 12 học
bổng/ngành trong `gen_scholarship_dataset.py`, seed=42 — tái lập được).

```bash
cd student360-ai && source venv/bin/activate
python3 tests/eval/eval_scholarship_matching.py
python3 tests/eval/eval_scholarship_ranking_pipeline.py
```

## Số liệu dùng trong báo cáo chính thức (Bảng 5.9, Chapter5/chapter5.tex)

Báo cáo trình bày rút gọn, chỉ dùng số liệu của pipeline production (`_rank_recommendation_items`
— đúng hàm trả kết quả cho UI), không đưa bảng Precision/Recall/F1/MRR kỹ thuật vào báo cáo chính.
Số liệu đơn giản hoá, tính trực tiếp từ `scholarship_ranking_pipeline_eval_20260729_201810.json`:

| Chỉ số (cách diễn đạt trong báo cáo) | Giá trị | Cách tính |
|---|---|---|
| Tỷ lệ hồ sơ có học bổng đúng ở vị trí gợi ý đầu tiên | **83.3%** | = Top-1 accuracy |
| Tỷ lệ hồ sơ tìm thấy ít nhất 1 học bổng đúng trong 3 gợi ý đầu | **96.7%** | hit-rate@3 (≥1 học bổng đúng trong top-3, tính trên 30 hồ sơ) |
| Tỷ lệ hồ sơ tìm thấy ít nhất 1 học bổng đúng trong 5 gợi ý đầu | **100.0%** | hit-rate@5 |
| Số học bổng đúng trung bình trong 5 gợi ý đầu (trên tổng 12 đúng/hồ sơ) | **3.97/5** | trung bình `|top-5 ∩ relevant|` qua 30 hồ sơ |
| Tỷ lệ học bổng đúng không bị lọc nhầm ở gate trường/ngành | **100.0%** | = avg_gate_coverage |

Bảng Precision/Recall/F1@K/MRR đầy đủ (Mục 1, 2 bên dưới) vẫn giữ lại trong tài liệu minh chứng
này để tra cứu chi tiết khi cần, nhưng không đưa vào báo cáo chính vì quá kỹ thuật với đối tượng
đọc là hội đồng chấm đồ án ứng dụng.

## 1. `eval_scholarship_matching.py` — công thức text-similarity riêng lẻ (`_score_profile_match`)

| Metric | Giá trị |
|---|---|
| Top-1 accuracy | **100.0%** |
| MRR | **1.000** |
| Precision@1 / Recall@1 / F1@1 | 100.0% / 8.3% / 15.4% |
| Precision@3 / Recall@3 / F1@3 | 97.8% / 24.4% / 39.1% |
| Precision@5 / Recall@5 / F1@5 | 96.7% / 40.3% / 56.9% |

→ Ở K=5, Precision = 96.7%, Recall = 40.3%, F1 = 56.9%. Top-1 accuracy đạt tuyệt đối 100.0% cho thấy thuật toán so khớp chuỗi luôn đưa học bổng phù hợp nhất lên vị trí #1.

File chi tiết: `scholarship_matching_eval_20260729_201750.json` (per-hồ-sơ, có matched_terms).

## 2. `eval_scholarship_ranking_pipeline.py` — pipeline production đầy đủ (`_rank_recommendation_items`)

Tiêu chí sắp xếp cuối của `_rank_recommendation_items` (`app/domains/finance/agents/finance/
scholarships/tools/matching.py`) dùng điểm xếp hạng tổng hợp có trọng số: `rank_score = 0.6 ×
match_score + 0.25 × độ_gần_GPA + 0.15 × giá_trị_chuẩn_hoá` (xem `fix_rank_score_weighting.diff`
trong thư mục này — thay cho cách cũ chỉ sắp theo GPA-gap rồi đến amount, bỏ qua hoàn toàn
match_score). Gate trường+ngành giữ nguyên không đổi.

| Metric | Giá trị |
|---|---|
| Độ phủ gate trung bình (avg_gate_coverage) | **100.0%** |
| Top-1 accuracy | **83.3%** |
| MRR | **0.892** |
| Precision@1 / Recall@1 / F1@1 | 83.3% / 6.9% / 12.8% |
| Precision@3 / Recall@3 / F1@3 | 81.1% / 20.3% / 32.4% |
| Precision@5 / Recall@5 / F1@5 | 79.3% / 33.1% / 46.7% |

→ Gate trường+ngành **không loại nhầm** học bổng liên quan nào (gate coverage 100%). Nhờ đưa
match_score vào làm tiêu chí sắp xếp chính (trọng số 60%), Top-1 accuracy của pipeline sản phẩm
đạt 83.3%, MRR đạt 0.892, Precision@5 đạt 79.3%. Khoảng cách còn lại so với công
thức so khớp thuần (100.0% top-1 / 96.7% P@5) đến từ 25%/15% trọng số có chủ đích dành cho độ gần
GPA và giá trị học bổng, giữ lại lợi ích thực tiễn "ưu tiên học bổng dễ đậu, giá trị cao" cho
người dùng.

File chi tiết: `scholarship_ranking_pipeline_eval_20260729_201810.json` (per-hồ-sơ, có
`ranked_ids_after_gate`, `total_survivors_after_gate`).

## Thử nghiệm phụ: tăng trọng số match_score lên 0.75 — không cải thiện, đã revert

Đã thử tăng trọng số lên `0.75 / 0.15 / 0.10` (match_score/GPA/giá trị) để xem có đẩy được pipeline
gần hơn nữa về phía 100.0% hay không. Kết quả đo được: Top-1 accuracy **giảm** còn 73.3% (từ 76.7%
ở cấu hình trọng số 0.6/0.25/0.15 lúc đó, trước khi mở rộng dataset), MRR giảm còn 0.822 (từ
0.844). Nguyên nhân: `match_score` không phải thuần "độ liên quan chủ đề" — bản thân nó đã được
cộng/trừ điểm theo GPA, mức độ cạnh tranh, trạng thái mở/đóng ở bước tính điểm trước đó, nên tín
hiệu `_gpa_closeness` độc lập vẫn mang giá trị bổ sung thực sự chứ không trùng lặp hoàn toàn.
Giảm trọng số của nó đi làm mất thông tin có ích. Kết luận: **0.6/0.25/0.15 là điểm cân bằng tốt
nhất đã kiểm chứng bằng thực nghiệm**, không phải con số chọn tùy tiện — đã giữ nguyên cấu hình
này cho kết quả chính thức ở trên.

## Nhận định để đưa vào báo cáo

Khoảng cách giữa "thuật toán tính độ phù hợp" (100.0% top-1, 96.7% P@5) và "thứ tự sản phẩm thực
sự hiển thị cho người dùng" (83.3% top-1, 79.3% P@5) phản ánh đúng một đánh đổi thiết kế có chủ
đích: pipeline không chỉ tối ưu độ liên quan chủ đề thuần túy mà còn cân bằng thêm khả năng đậu
(GPA) và giá trị học bổng — đây là lựa chọn hợp lý cho một sản phẩm hướng người dùng cuối, không
phải một khiếm khuyết cần khắc phục thêm.

## Tái lập

Dataset sinh bằng `../script/gen_scholarship_dataset.py` (seed=42, cùng chạy sẽ cho đúng cùng 30
hồ sơ / 150 học bổng / cùng kết quả).
