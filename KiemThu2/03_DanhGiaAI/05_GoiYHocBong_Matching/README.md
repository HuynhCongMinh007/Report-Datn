# 05_GoiYHocBong_Matching — Đánh giá chất lượng gợi ý học bổng

**Trạng thái: ĐÃ CHẠY XONG chính thức.** Xem số liệu và nhận định tại `results/summary.md`.

## Phạm vi đo

Đo độ chính xác/chất lượng xếp hạng của thuật toán gợi ý học bổng — điều mà đo latency thuần
(P50/P95/P99) không phản ánh được. Dữ liệu: 30 hồ sơ x 36 học bổng (10 trường x 10 ngành, từ vựng
có kiểm soát để so khớp chuỗi chính xác), sinh bằng `script/gen_scholarship_dataset.py` (seed=42,
tái lập được 100%).

**Ground truth `relevant_scholarship_ids`**: định nghĩa theo cấu trúc dữ liệu (học bổng nhắm đích
danh đúng ngành của hồ sơ, không tính học bổng mở cho "mọi ngành" là liên quan), độc lập với công
thức fuzzy-matching đang được kiểm thử — tránh vòng lặp tự-chứng-minh.

## 2 script đo 2 tầng khác nhau

Rà soát phát hiện: hàm production thật sự trả kết quả gợi ý (`_rank_recommendation_items`,
`student360-ai/app/domains/finance/agents/finance/scholarships/tools/matching.py`) làm 2 việc mà
công thức tính điểm text-similarity (`_score_profile_match`) một mình không thể hiện — (1) **gate
cứng**: chỉ giữ học bổng khớp CẢ trường lẫn ngành hồ sơ; (2) **sắp xếp theo GPA-gap/amount/đang mở**
cho các học bổng qua gate, không phải theo điểm text-similarity (điểm đó chỉ dùng hiển thị badge %
trên UI). Vì vậy có 2 script đo 2 tầng riêng:

- **`script/eval_scholarship_matching.py`** — đo riêng công thức `_score_profile_match` (sub-component).
- **`script/eval_scholarship_ranking_pipeline.py`** — đo đúng hàm production `_rank_recommendation_items`
  (gate + sort), phản ánh cái sản phẩm thực sự trả về cho người dùng.

Cả 2 đều là hàm thuần (không mạng/DB/LLM), dùng chung 1 bộ dữ liệu.

## Cách chạy lại

```bash
cd student360-ai
source venv/bin/activate

# Không cần tài khoản, không cần backend/AI service chạy.
python3 tests/eval/eval_scholarship_matching.py
python3 tests/eval/eval_scholarship_ranking_pipeline.py
```

## Cấu trúc thư mục

```
05_GoiYHocBong_Matching/
├── README.md                              (file này)
├── script/
│   ├── gen_scholarship_dataset.py         Sinh dữ liệu (seed=42, tái lập được)
│   ├── eval_scholarship_matching.py       Đo riêng _score_profile_match (sub-component)
│   └── eval_scholarship_ranking_pipeline.py  Đo pipeline đầy đủ (gate + sort)
├── data/
│   └── scholarship_matching_eval_set.json 30 hồ sơ x 36 học bổng
└── results/
    ├── summary.md                          Số liệu + nhận định chính thức
    ├── scholarship_matching_eval_*.json    Báo cáo chi tiết per-hồ-sơ (sub-component)
    └── scholarship_ranking_pipeline_eval_*.json  Báo cáo chi tiết per-hồ-sơ (pipeline đầy đủ)
```
