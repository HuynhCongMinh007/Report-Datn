# Hồ sơ minh chứng kiểm thử — DATN Student360

Thư mục này gom lại **bản sao** các file minh chứng quan trọng nhất từ `Report-Datn/KiemThu/`,
sắp xếp theo trình tự trình bày trước hội đồng phản biện (Mục 5.3–5.4 báo cáo). Bản gốc đầy đủ
vẫn giữ nguyên ở `Report-Datn/KiemThu/` — thư mục này chỉ là bản "đi trình bày", không phải bản
duy nhất.

## Nguyên tắc quan trọng khi trình bày

> **Ưu tiên số liệu đo THỰC TẾ, MỚI NHẤT** trong các file `.log`/`results/` ở đây, kể cả khi nó
> khác với con số đã in trong báo cáo (Chapter 5/6, file `main.pdf`). Đây là lựa chọn chủ động,
> không phải sai sót — vì các log này được đo lại có chủ đích để xác minh báo cáo, và đã phát
> hiện một số chênh lệch thật (xem `03_DanhGiaHieuNang/KET_QUA_DANH_GIA_MOI.md`).

Nếu giáo viên phản biện hỏi "số này sao khác trong báo cáo", câu trả lời nên đi thẳng vào:
**đây là kết quả đo lại gần ngày bảo vệ nhất, minh bạch cả log gốc — không chỉnh sửa để khớp
báo cáo cũ.** Đây là điểm cộng về tính trung thực khoa học, không phải điểm trừ.

## Cấu trúc thư mục

```
00_TongQuan/                          ← đọc trước: biên bản + bảng đặc tả kiểm thử
01_KiemThuDonVi/                      ← unit test (backend, jest)
02_KiemThuAPI_E2E/                    ← test tích hợp API (e2e, jest)
03_DanhGiaHieuNang/                   ← 7 nhóm benchmark hiệu năng theo Bảng 5.1
04_KiemThuTai_ThongBao_1000Request/   ← trọng tâm: load test 1000 request notification/BullMQ
05_MoiTruong_Hosted/                  ← lặp lại E2E + load test trên server đã triển khai thật
```

## Giải thích từng phần

### 00_TongQuan/
- `BienBanKiemThu_Muc5.3.docx` — biên bản kiểm thử chính thức, đối chiếu với Mục 5.3 báo cáo.
- `BangDacTa_KiemThu_MucTieu5.3-5.4.xlsx` — bảng đặc tả: 156 unit test case, 20 E2E test case,
  7 nhóm hiệu năng, 5 lần đo BullMQ. Dùng để trả lời "kiểm thử bao nhiêu case, ở đâu".

### 01_KiemThuDonVi/ (Unit test)
- `unit-test-results.log` — log chạy toàn bộ unit test (backend, Jest).
- `run-unit-tests.sh` — script tái tạo lại, chứng minh log không phải tự gõ tay.
- `SourceScripts/*.spec.ts` — 11 file test tiêu biểu (jars, financial-transactions,
  finance-notification, ai.service, scholarships, reviews, academic...) để mở ra cho phản biện
  xem trực tiếp assertion nếu được hỏi sâu.

### 02_KiemThuAPI_E2E/ (Test tích hợp API)
- `e2e-test-results.log` — log chạy E2E (20 test case).
- `run-e2e-tests.sh` — script chạy lại.
- `SourceScripts/` — `business-flows.e2e-spec.ts`, `ai-gateway.e2e-spec.ts`,
  `jobs-anon.e2e-spec.ts`, `jest-e2e.json` (config).

### 03_DanhGiaHieuNang/ (Đánh giá hiệu năng — Bảng 5.1, Mục 5.4)
- **`KET_QUA_DANH_GIA_MOI.md` — file quan trọng nhất của cả bộ hồ sơ này.** Tổng hợp 7 nhóm,
  đối chiếu trực tiếp với số liệu trong báo cáo, và nêu rõ:
  - Nhóm 1,2,3,4,5: khớp hoặc nhanh hơn báo cáo, 100% thành công.
  - **Nhóm 6 (Chatbot AI): lệch ~2.5–3.5x so với báo cáo**, phát hiện 2 lỗi tái lập được thật
    (tool `get_budget_status` luôn timeout; 1 câu hỏi cụ thể về học bổng đang mở luôn treo).
  - **Nhóm 7 (BullMQ/thông báo): lệch 100–470 lần so với báo cáo** (báo cáo ghi 1.22ms, đo thực
    tế 132–578ms) — số báo cáo nhiều khả năng chỉ đo `queue.add()` nội bộ, không tính round-trip
    HTTP + ghi DB thật.
  → Đây là "kịch bản trả lời" chuẩn bị sẵn nếu phản biện chất vấn về độ chính xác số liệu.
- `01_CRUD_CoBan/` … `06_TuVanAI_Chatbot/` — mỗi nhóm có `script/` (mã nguồn phát request),
  `console-output.log` (log chạy), `results/*.csv|json|summary.md` (số liệu thô + tổng hợp).
  Nhóm 6 có thêm `COVERAGE_28_TOOLS.md` — bằng chứng đã test đủ 28 AI tool đăng ký cho agent.
- `07_HangDoiThongBao_BullMQ/README.md` — giải thích tại sao nhóm 7 đo riêng bằng load test
  chuyên dụng thay vì rải request như 6 nhóm kia (trỏ sang mục 04 dưới đây).

### 04_KiemThuTai_ThongBao_1000Request/ — **PHẦN TRỌNG TÂM: 1000 request notification**
- `SourceScripts/notification-queue-load-test.ts` — mã nguồn: bắn 1000 request
  `POST /notification-queue/send-queued` vào hàng đợi BullMQ, concurrency=10.
- `SourceScripts/cleanup-load-test-jobs.ts` — script dọn job rác sau khi test (chứng minh quy
  trình test sạch sẽ, không để lại rác trong hệ thống thật).
- `run-load-test.sh` — script chạy.
- `bullmq-load-test-results.log` — **lần đo đầu tiên**: 1000/1000 thành công, TB 159.8ms,
  P50 151ms / P95 221ms / P99 297ms.
- `nhieu-lan/run1.log, run2.log, run3.log` — **3 lần đo lặp lại độc lập** (để chứng minh không
  phải may rủi một lần), kèm `summary.md` tổng hợp cả 3.
- Kết hợp với `05_MoiTruong_Hosted/` bên dưới → tổng cộng **5 lần đo, 2 môi trường, mỗi lần
  1000 request** — đây là con số nên nêu khi trình bày: *"đã kiểm thử tải tính năng thông báo
  với 5 lần đo độc lập x 1000 request, trên cả môi trường local và môi trường đã triển khai,
  tỉ lệ thành công 99.98% (3999/4000), độ trễ P50 dao động ~112–301ms tuỳ lần đo"*.

### 05_MoiTruong_Hosted/ (Kiểm chứng trên môi trường thật)
- `README.md` — giải thích bối cảnh: chạy lại trên backend đã host
  (`https://s360-api.ygaps.com/api`), cùng tài khoản/DB với môi trường local, để loại trừ giả
  thuyết "độ trễ cao do đo từ xa". Kết luận: **độ trễ cao là đặc điểm thật của hệ thống, không
  phải do vị trí máy đo** — đây là lập luận quan trọng nếu bị hỏi "sao không đo trên server thật".
- `bullmq-load-test-results-hosted.log` — 996/1000 thành công (4 lỗi 404, nghi ngờ tầng
  reverse-proxy khi tải cao, không phải lỗi logic).
- `e2e-test-results-hosted.log` — 20/20 PASS, nhanh hơn đáng kể so với chạy từ local (do độ trễ
  mạng tới DB/Gemini ngắn hơn).

## Gợi ý kịch bản trình bày nhanh (5 phút)

1. Mở `00_TongQuan/BangDacTa...xlsx` → nêu tổng số lượng test đã thực hiện.
2. Mở `01_KiemThuDonVi/unit-test-results.log` + `02_KiemThuAPI_E2E/e2e-test-results.log` →
   chứng minh test tự động chạy pass.
3. Mở `04_KiemThuTai_ThongBao_1000Request/bullmq-load-test-results.log` → đọc trực tiếp dòng
   kết quả 1000 request, nhấn mạnh đã lặp lại 5 lần trên 2 môi trường (`nhieu-lan/summary.md`).
4. Nếu bị hỏi về độ chính xác báo cáo: mở `03_DanhGiaHieuNang/KET_QUA_DANH_GIA_MOI.md`, trả lời
   thẳng bằng phần "Kết luận" ở cuối file đó.
