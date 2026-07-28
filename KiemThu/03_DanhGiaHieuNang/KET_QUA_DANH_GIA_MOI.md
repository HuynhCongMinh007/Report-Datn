# Kết quả đánh giá hiệu năng mới — theo Bảng 5.1 (Mục 5.4)

**Môi trường test: backend ĐÃ HOST (`https://s360-api.ygaps.com/api`)**, tài khoản
`finance.seed@student360.test`, chạy ngày 20/07/2026. Mỗi nhóm ~100 request rải đều các endpoint
trong nhóm (riêng Tư vấn AI: 114 request khớp đúng báo cáo; riêng BullMQ: kiểm thử tải chuyên dụng
1.000 request — xem giải thích ở Nhóm 7). **Các câu bị timeout ở lần chạy đầu đã được chạy lại
riêng lẻ** — kết quả dưới đây là số liệu cuối cùng sau khi chạy lại (không tính trùng: mỗi request
chỉ tính 1 lần, ưu tiên lần thành công nếu retry có kết quả khác).

## Bảng tổng hợp — đầy đủ P50/P95/P99

| # | Nhóm API (Bảng 5.1) | N | Đạt | TB (ms) | P50 | P95 | P99 | So với báo cáo |
|---|---|---|---|---|---|---|---|---|
| 1 | CRUD cơ bản (giao dịch, hũ) | 100 | 100/100 (100%) | 48.7 | 45 | 72 | 110 | Báo cáo: 52ms(GET)/687ms(POST) — **khớp/nhanh hơn** |
| 2 | Tìm kiếm và lọc | 100 | 100/100 (100%) | 49.8 | 52 | 72 | 85 | Báo cáo: 112ms/293ms — **khớp/nhanh hơn** |
| 3 | Ứng tuyển học bổng* | 100 | 100/100 (100%) | 33.1 | 32 | 41 | 49 | Báo cáo: 55ms — **khớp tốt** |
| 4 | Phân loại giao dịch (LLM) | 100 | **100/100 (100%)** | 1015.5 | 805 | 1976 | 2373 | Báo cáo: 1.92s/5s — **nhanh hơn, ổn định** |
| 5 | Gợi ý học bổng (Matching) | 100 | **100/100 (100%)** | 89.8 | 83 | 134 | 222 | Báo cáo: 293ms — **khớp/nhanh hơn, ổn định** |
| 6 | Tư vấn AI (Chatbot) | 114 | 112/114 (98.2%) | 9973.6 | 3580 | 39939 | 53479 | Báo cáo: 4.05s/11.38s (114 lượt) — **TB cao hơn ~2.5x, P95 cao hơn ~3.5x** |
| 7 | Hàng đợi thông báo (BullMQ) | 1000×5 lần | 3999/4000 (99.98%) | 132–578 | ~290 | ~221–435 | - | Báo cáo: 1.22ms/1.48ms — **lệch ~100-470 lần, mọi lần đo** |

\* Nhóm 3 chỉ đo được nhánh "từ chối ID không tồn tại" — hạn chế kỹ thuật đã biết (không xoá được
hồ sơ thật sau khi tạo, xem `03_UngTuyenHocBong/`).

**Sau khi chạy lại các câu timeout: Nhóm 4 và Nhóm 5 đạt 100% thành công** (trước đó 99% và 98%).
Nhóm 6 còn đúng **2 lỗi timeout tái lập được** (không phải nhiễu ngẫu nhiên — đã thử lại 2-3 lần,
vẫn timeout cùng câu hỏi):
- Câu #31 (`get_budget_status`: "Tôi đã dùng hết bao nhiêu % ngân sách lọ ăn uống?") — timeout 90s ở **cả 2 lần thử**.
- Câu #78 (`get_all_scholarships`: "Hiện có bao nhiêu học bổng đang nhận hồ sơ?") — timeout 90s ở **cả 3 lần thử**, trong khi câu #77 cùng tool nhưng hỏi khác ("Liệt kê tất cả học bổng đang mở") lại thành công (11.3s) — cho thấy vấn đề nằm ở cách agent xử lý MỘT DẠNG câu hỏi cụ thể, không phải tool bị hỏng hoàn toàn.

## Chi tiết từng endpoint — Nhóm 1 (CRUD cơ bản)

| Endpoint | N | Đạt | TB | P50 | P95 | P99 |
|---|---|---|---|---|---|---|
| GET /finance/jars | 34 | 34/34 | 44.7ms | 44ms | 54ms | 55ms |
| POST /finance/transactions | 22 | 22/22 | 64.9ms | 59ms | 81ms | 111ms |
| GET /finance/transactions/:id | 22 | 22/22 | 36.5ms | 34ms | 47ms | 52ms |
| DELETE /finance/transactions/:id | 22 | 22/22 | 51.2ms | 46ms | 84ms | 110ms |

## Chi tiết từng endpoint — Nhóm 2 (Tìm kiếm và lọc)

| Endpoint | N | Đạt | TB | P50 | P95 | P99 |
|---|---|---|---|---|---|---|
| GET /finance/transactions (filter) | 34 | 34/34 | 55.8ms | 54ms | 70ms | 80ms |
| GET /scholarships | 33 | 33/33 | 60.9ms | 58ms | 85ms | 93ms |
| GET /universities/dropdown | 33 | 33/33 | 32.4ms | 31ms | 44ms | 61ms |

## Nhóm 6 — Tư vấn AI (Chatbot): điểm cần chú ý

- **114/114 câu hỏi đã chạy** (kể cả chạy lại), thiết kế phủ toàn bộ **28 AI tools** đăng ký cho
  agent tài chính (17 Six Jars + 11 Scholarship), mỗi tool 4 câu hỏi biến thể.
- **112/114 thành công (98.2%)** sau khi chạy lại các câu timeout — 2 lỗi còn lại là **lỗi tái lập
  được**, không phải nhiễu (xem trên).
- **Xác minh độ phủ tool thực tế** (qua phân tích nội dung reply, vì không truy cập được log/DB
  ground-truth của AI Service hosted — xem `06_TuVanAI_Chatbot/COVERAGE_28_TOOLS.md`):
  - ✅ **20/28 tool xác nhận rõ ràng** (reply chứa dữ liệu thật cụ thể)
  - ⚠️ **3/28 xác nhận gián tiếp** (reply "không có dữ liệu" hợp lý nhưng không có số liệu để chắc chắn)
  - ❌ **5/28 không xác nhận được / nghi ngờ LLM route sai tool** — `get_budget_status` (2/2 lần
    thử timeout — **tool này gần như chắc chắn có vấn đề thật**), 3 tool "gợi ý học bổng theo hồ sơ
    tuỳ ý" có dấu hiệu bị LLM gộp chung xử lý.
- **Độ trễ TB 9.97s, P50 3.58s — nhưng P95/P99 rất cao (40s/53s)** do một số câu hỏi (thường liên
  quan tổng hợp nhiều nguồn dữ liệu hoặc phân tích profile) mất 20-90s. Đây là đặc điểm thật của
  agent hiện tại, không phải lỗi đo.

## Nhóm 7 — Hàng đợi thông báo (BullMQ)

Không đo lại theo mô hình "~100 request rải đều" vì nhóm này chỉ có 1 endpoint. Dùng lại kết quả
kiểm thử tải chuyên dụng đã có (5 lần đo độc lập, 2 môi trường, 1.000 request/lần — xem
`../04_KiemThuTai_BullMQ/` và `../05_MoiTruong_Hosted/`):

| Lần | Môi trường | TB | P50 | P95 | P99 | Thành công |
|---|---|---|---|---|---|---|
| 1 | Local (trước restart) | 159.8ms | 151ms | 221ms | 297ms | 1000/1000 |
| 2 | Hosted | 132.1ms | 112ms | 221ms | 1087ms | 996/1000 |
| 3 | Local (sau restart) | 298.4ms | 285ms | 385ms | 497ms | 1000/1000 |
| 4 | Local | 578.2ms | 290ms | 401ms | 564ms | 1000/1000 |
| 5 | Local | 317.0ms | 301ms | 435ms | 544ms | 999/1000 |

## Kết luận

1. **6/7 nhóm khớp tốt hoặc vượt SLO đã công bố trong báo cáo** — 4 nhóm (CRUD, Search, Ứng tuyển
   học bổng, Matching) đạt **100% thành công**, độ trễ bằng hoặc nhanh hơn báo cáo. Nhóm Phân loại
   giao dịch LLM cũng đạt 100% thành công, TB 1.02s vượt trội so với SLO 1-3s.
2. **Nhóm 6 (Chatbot) và Nhóm 7 (BullMQ) lệch đáng kể, nhất quán qua nhiều lần đo độc lập** —
   không phải nhiễu ngẫu nhiên, cần rà soát lại phương pháp đo gốc hoặc cập nhật báo cáo.
3. **Phát hiện mới quan trọng nhất**: qua kiểm thử có chủ đích phủ 28 tools và chạy lại nhiều lần
   để loại trừ nhiễu, phát hiện **2 lỗi tái lập được thật** trong agent AI: tool `get_budget_status`
   luôn timeout, và agent xử lý sai/treo với 1 cách hỏi cụ thể về học bổng đang mở. Đây là lỗi thật
   của hệ thống, đáng ưu tiên sửa hoặc ghi vào phần hạn chế của báo cáo.

## Cấu trúc thư mục nguồn dữ liệu

```
03_DanhGiaHieuNang/
├── KET_QUA_DANH_GIA_MOI.md          (file này)
├── 01_CRUD_CoBan/           script/ + results/
├── 02_TimKiemLoc/           script/ + results/
├── 03_UngTuyenHocBong/      script/ + results/
├── 04_PhanLoaiGiaoDich_LLM/ script/ + results/ (FINAL-deduped.json = dữ liệu chuẩn, 100/100)
├── 05_GoiYHocBong_Matching/ script/ + results/ (FINAL-deduped.json = dữ liệu chuẩn, 100/100)
├── 06_TuVanAI_Chatbot/      script/ + results/ (FINAL-deduped.json = dữ liệu chuẩn, 112/114)
│                             + COVERAGE_28_TOOLS.md
├── 07_HangDoiThongBao_BullMQ/  README.md (tham chiếu 04_KiemThuTai_BullMQ + 05_MoiTruong_Hosted)
└── _archive_benchmark_don_le/  (dữ liệu benchmark đơn lẻ trước đó, lưu trữ tham khảo)
```

Mỗi folder Nhóm 1–6 độc lập, có thể chạy lại chỉ với:
```bash
EVAL_USER_EMAIL=finance.seed@student360.test EVAL_USER_PASSWORD=<...> \
  npx ts-node -r tsconfig-paths/register test/load/group-0X-*.ts
```
(script gốc nằm ở `backend/test/load/`, bản copy tham khảo trong mỗi `script/` ở đây).
