# Nhóm 7 — Hàng đợi thông báo (BullMQ)

Nhóm này (dòng cuối Bảng 5.1) chỉ có **1 endpoint duy nhất** (`POST /notification-queue/send-queued`),
khác về bản chất với 6 nhóm còn lại (không có nhiều "API trong nhóm" để chia đều) — nên được đo
bằng **kiểm thử tải chuyên dụng** (1.000 request, concurrency=10) thay vì mô hình "N câu gọi rải
đều nhiều endpoint" như các nhóm 1–6.

Toàn bộ script, log và kết quả (5 lần đo độc lập — local x4 lần khác nhau + hosted x1 lần) đã có
sẵn tại:

- `../../04_KiemThuTai_BullMQ/` — script gốc, log lần đầu, `nhieu-lan/` (3 lần chạy thêm)
- `../../05_MoiTruong_Hosted/` — lần chạy trên backend hosted

Không tạo lại/nhân bản dữ liệu ở đây để tránh sai lệch giữa 2 bản sao. Số liệu tổng hợp 5 lần đo
xem tại `../KET_QUA_DANH_GIA_MOI.md` mục "Nhóm 7" hoặc trực tiếp
`../../04_KiemThuTai_BullMQ/nhieu-lan/summary.md`.
