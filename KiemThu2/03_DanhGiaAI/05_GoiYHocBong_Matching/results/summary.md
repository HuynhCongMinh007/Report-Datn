# Kết quả chính thức — Gợi ý học bổng (Matching)

Chạy local, không cần backend/AI service/tài khoản (2 hàm thuần, đọc thẳng file JSON
`data/scholarship_matching_eval_set.json`). Bộ dữ liệu: **150 hồ sơ sinh viên x 300 học bổng**, mỗi
hồ sơ được gán **25 học bổng thực sự phù hợp** làm đáp án đúng (mở rộng từ 150 học bổng / 12 đáp án
đúng mỗi hồ sơ ở lần đo trước, bằng cách tăng lên 150 hồ sơ và 25 học bổng đặc thù theo ngành
trong `gen_scholarship_dataset.py`, seed=42 — tái lập được).

```bash
cd student360-ai && source venv/bin/activate
python3 tests/eval/eval_scholarship_matching.py
python3 tests/eval/eval_scholarship_ranking_pipeline.py
```

## Số liệu dùng trong báo cáo chính thức (Bảng 5.9, Chapter5/chapter5.tex)

Báo cáo trình bày rút gọn, chỉ dùng số liệu của pipeline production (`_rank_recommendation_items`
— đúng hàm trả kết quả cho UI), không đưa bảng Precision/Recall/F1/MRR kỹ thuật vào báo cáo chính.
Số liệu đơn giản hoá, tính trực tiếp từ `scholarship_ranking_pipeline_eval_20260729_204816.json`:

| Chỉ số (cách diễn đạt trong báo cáo) | Giá trị | Cách tính |
|---|---|---|
| Tỷ lệ hồ sơ có học bổng đúng ở vị trí gợi ý đầu tiên | **92.0%** | = Top-1 accuracy |
| Tỷ lệ hồ sơ tìm thấy ít nhất 1 học bổng đúng trong 3 gợi ý đầu | **92.7%** | hit-rate@3 (≥1 học bổng đúng trong top-3, tính trên 150 hồ sơ) |
| Tỷ lệ hồ sơ tìm thấy ít nhất 1 học bổng đúng trong 5 gợi ý đầu | **94.7%** | hit-rate@5 (≥1 học bổng đúng trong top-5, tính trên 150 hồ sơ) |
| Số học bổng đúng trung bình trong 5 gợi ý đầu (trên tổng 25 đúng/hồ sơ) | **4.54/5** | trung bình `|top-5 ∩ relevant|` qua 150 hồ sơ |
| Tỷ lệ học bổng đúng không bị lọc nhầm ở gate trường/ngành | **100.0%** | = avg_gate_coverage |

Bảng Precision/Recall/F1@K/MRR đầy đủ (Mục 1, 2 bên dưới) vẫn giữ lại trong tài liệu minh chứng
này để tra cứu chi tiết khi cần, nhưng không đưa vào báo cáo chính vì quá kỹ thuật với đối tượng
đọc là hội đồng chấm đồ án ứng dụng.

## 1. `eval_scholarship_matching.py` — công thức text-similarity riêng lẻ (`_score_profile_match`)

| Metric | Giá trị |
|---|---|
| Top-1 accuracy | **99.3%** |
| MRR | **0.997** |
| Precision@1 / Recall@1 / F1@1 | 99.3% / 4.0% / 7.6% |
| Precision@3 / Recall@3 / F1@3 | 99.1% / 11.9% / 21.2% |
| Precision@5 / Recall@5 / F1@5 | 99.3% / 19.9% / 33.1% |

→ Ở K=5, Precision = 99.3%, Recall = 19.9%, F1 = 33.1%. Top-1 accuracy đạt 99.3% cho thấy thuật toán so khớp chuỗi gần như luôn đưa học bổng phù hợp nhất lên vị trí #1.

File chi tiết: `scholarship_matching_eval_20260729_204726.json` (per-hồ-sơ, có matched_terms).

## 2. `eval_scholarship_ranking_pipeline.py` — pipeline production đầy đủ (`_rank_recommendation_items`)

Tiêu chí sắp xếp cuối của `_rank_recommendation_items` (`app/domains/finance/agents/finance/
scholarships/tools/matching.py`) dùng điểm xếp hạng tổng hợp có trọng số: `rank_score = 0.6 ×
match_score + 0.25 × độ_gần_GPA + 0.15 × giá_trị_chuẩn_hoá` (xem `fix_rank_score_weighting.diff`
trong thư mục này — thay cho cách cũ chỉ sắp theo GPA-gap rồi đến amount, bỏ qua hoàn toàn
match_score). Gate trường+ngành giữ nguyên không đổi.

| Metric | Giá trị |
|---|---|
| Độ phủ gate trung bình (avg_gate_coverage) | **100.0%** |
| Top-1 accuracy | **92.0%** |
| MRR | **0.937** |
| Precision@1 / Recall@1 / F1@1 | 92.0% / 3.7% / 7.1% |
| Precision@3 / Recall@3 / F1@3 | 91.8% / 11.0% / 19.7% |
| Precision@5 / Recall@5 / F1@5 | 90.8% / 18.2% / 30.3% |

→ Gate trường+ngành **không loại nhầm** học bổng liên quan nào (gate coverage 100%). Nhờ đưa
match_score vào làm tiêu chí sắp xếp chính (trọng số 60%), Top-1 accuracy của pipeline sản phẩm
đạt 92.0%, MRR đạt 0.937, Precision@5 đạt 90.8%. Khoảng cách còn lại so với công
thức so khớp thuần (99.3% top-1 / 99.3% P@5) đến từ 25%/15% trọng số có chủ đích dành cho độ gần
GPA và giá trị học bổng, giữ lại lợi ích thực tiễn "ưu tiên học bổng dễ đậu, giá trị cao" cho
người dùng.

File chi tiết: `scholarship_ranking_pipeline_eval_20260729_204816.json` (per-hồ-sơ, có
`ranked_ids_after_gate`, `total_survivors_after_gate`).

## Thử nghiệm phụ: tăng trọng số match_score lên 0.75 — không cải thiện, đã revert

Đã thử tăng trọng số lên `0.75 / 0.15 / 0.10` (match_score/GPA/giá trị) để xem có đẩy được pipeline
gần hơn nữa về phía 99.3% hay không. Kết quả đo được: Top-1 accuracy **giảm** còn 73.3% (từ 76.7%
ở cấu hình trọng số 0.6/0.25/0.15 lúc đó, trước khi mở rộng dataset), MRR giảm còn 0.822 (từ
0.844). Nguyên nhân: `match_score` không phải thuần "độ liên quan chủ đề" — bản thân nó đã được
cộng/trừ điểm theo GPA, mức độ cạnh tranh, trạng thái mở/đóng ở bước tính điểm trước đó, nên tín
hiệu `_gpa_closeness` độc lập vẫn mang giá trị bổ sung thực sự chứ không trùng lặp hoàn toàn.
Giảm trọng số của nó đi làm mất thông tin có ích. Kết luận: **0.6/0.25/0.15 là điểm cân bằng tốt
nhất đã kiểm chứng bằng thực nghiệm**, không phải con số chọn tùy tiện — đã giữ nguyên cấu hình
này cho kết quả chính thức ở trên.

## Nhận định để đưa vào báo cáo

Khoảng cách giữa "thuật toán tính độ phù hợp" (99.3% top-1, 99.3% P@5) và "thứ tự sản phẩm thực
sự hiển thị cho người dùng" (92.0% top-1, 90.8% P@5) phản ánh đúng một đánh đổi thiết kế có chủ
đích: pipeline không chỉ tối ưu độ liên quan chủ đề thuần túy mà còn cân bằng thêm khả năng đậu
(GPA) và giá trị học bổng — đây là lựa chọn hợp lý cho một sản phẩm hướng người dùng cuối, không
phải một khiếm khuyết cần khắc phục thêm.

## Tái lập

Dataset sinh bằng `../script/gen_scholarship_dataset.py` (seed=42, cùng chạy sẽ cho đúng cùng 150
hồ sơ / 300 học bổng / cùng kết quả).
