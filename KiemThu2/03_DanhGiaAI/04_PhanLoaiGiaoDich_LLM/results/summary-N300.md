# Tổng hợp đánh giá độ chính xác phân loại giao dịch AI — N=300 (50 mẫu/hũ)

Tổng hợp từ 6 batch chạy độc lập (`batch-01-essentials` .. `batch-06-reserve`), mỗi batch 50 mẫu,
chạy qua `POST /ai/6jars/classify` (backend local + AI service docker), tài khoản
`finance.seed@student360.test`, batch reserve chạy ngày 28/07/2026, 5 batch còn lại ngày 26/07/2026.

## Kết quả tổng thể

- **Tổng mẫu thử: 300**
- **Số mẫu phân loại đúng: 294**
- **Accuracy: 98.0%**
- **Macro-F1: 98.0%**

## Bảng Accuracy theo từng hũ

| Hũ tài chính | Tổng mẫu | Đúng | Accuracy |
|---|---|---|---|
| Chi tiêu thiết yếu (essentials) | 50 | 46 | 92.0% |
| Giáo dục (education) | 50 | 49 | 98.0% |
| Đầu tư (investment) | 50 | 50 | 100.0% |
| Thiện tâm (sharing) | 50 | 50 | 100.0% |
| Hưởng thụ (enjoyment) | 50 | 49 | 98.0% |
| Tiết kiệm (reserve) | 50 | 50 | 100.0% |
| **Trung bình toàn hệ thống** | **300** | **294** | **98.0%** |

## Bảng Precision / Recall / F1 theo từng hũ

| Hũ tài chính | Precision | Recall | F1 |
|---|---|---|---|
| Chi tiêu thiết yếu | 100.0% | 92.0% | 95.8% |
| Giáo dục | 98.0% | 98.0% | 98.0% |
| Đầu tư | 100.0% | 100.0% | 100.0% |
| Thiện tâm | 100.0% | 100.0% | 100.0% |
| Hưởng thụ | 94.2% | 98.0% | 96.1% |
| Tiết kiệm | 96.2% | 100.0% | 98.0% |
| **Accuracy** | | | **98.0%** |
| **Macro-F1** | | | **98.0%** |

## Ma trận nhầm lẫn (hàng = nhãn đúng, cột = dự đoán, N=300)

| expected \ predicted | essentials | education | investment | sharing | enjoyment | reserve |
|---|---|---|---|---|---|---|
| essentials | 46 | 0 | 0 | 0 | 2 | 2 |
| education | 0 | 49 | 0 | 0 | 1 | 0 |
| investment | 0 | 0 | 50 | 0 | 0 | 0 |
| sharing | 0 | 0 | 0 | 50 | 0 | 0 |
| enjoyment | 0 | 1 | 0 | 0 | 49 | 0 |
| reserve | 0 | 0 | 0 | 0 | 0 | 50 |

## Nhận xét

1. **Hũ Tiết kiệm (reserve) đạt Accuracy tuyệt đối 100.0%** (50/50), không còn nhầm lẫn nào sang
   Đầu tư (investment), Giáo dục (education) hay Thiện tâm (sharing). Đây là hũ có Recall cao nhất
   trong toàn hệ thống cùng với Đầu tư và Thiện tâm.

2. **5 hũ còn lại (essentials, education, investment, sharing, enjoyment)** đạt Accuracy từ 92.0%
   đến 100.0%, với 2 hũ đạt tuyệt đối 100% (investment, sharing). Các lỗi còn sót lại là rải rác,
   không tập trung vào một cặp hũ cụ thể nào:
   - 2/50 mẫu essentials bị nhầm sang enjoyment, 2/50 nhầm sang reserve.
   - 1/50 mẫu education bị nhầm sang enjoyment.
   - 1/50 mẫu enjoyment bị nhầm sang education.

3. **Không còn hũ nào là điểm yếu có tính hệ thống.** Toàn bộ 6/300 mẫu sai còn lại (2.0%) đều là
   nhầm lẫn đơn lẻ ở ranh giới ngữ nghĩa gần giữa các hũ liền kề (essentials/enjoyment,
   education/enjoyment), không tạo thành một mẫu lỗi lặp lại rõ rệt như trước đây từng ghi nhận ở
   ranh giới reserve/investment.

## Nguồn dữ liệu chi tiết từng batch

Xem `results/batch-0{1..6}-<jar>/` — mỗi thư mục gồm `dataset-used.json` (50 mẫu đã chạy),
`raw-report.json` (báo cáo JSON gốc do `eval_classification.py` sinh ra, có id/description/
predicted_jar/confidence/source cho từng mẫu — trừ batch 01 do lỗi script ở lần chạy đầu, xem ghi
chú trong `batch-01-essentials/console-output.log`), và `console-output.log` (log console đầy đủ).
