# BullMQ — 3 lần chạy liên tiếp (mỗi lần 1.000 request, concurrency=10)

Chạy ngay sau khi backend local restart (xem `../../03_DanhGiaHieuNang/BenchmarkNhieuLan/summary.md`
mục "Sự cố backend crash" để biết bối cảnh).

| Lần | Thành công | Thất bại | Thời gian | Throughput | TB (ms) | P50 | P95 | P99 |
|---|---|---|---|---|---|---|---|---|
| 1 | 1000/1000 | 0 | 29.90s | 33.4 req/s | 298.4 | 285 | 385 | 497 |
| 2 | 1000/1000 | 0 | 57.92s | 17.3 req/s | 578.2 | 290 | 401 | 564 |
| 3 | 999/1000 | 1 (404) | 31.81s | 31.4 req/s | 317.0 | 301 | 435 | 544 |
| **TB 3 lần** | 2999/3000 (99.97%) | 1 | - | 27.4 req/s (TB) | **397.9** | ~290 | ~407 | ~535 |

So với lần đo trước đó (159.8ms TB, trước khi backend restart) và lần đo trên hosted (132.1ms TB),
3 lần chạy này sau khi restart đều **cao hơn** (298–578ms) — có thể do backend/connection pool vừa
khởi động lại chưa "ấm" (cold start), hoặc do tải dư từ các benchmark AI chạy ngay trước đó chưa
giải phóng hết tài nguyên. Dù vậy, **tất cả 4 lần đo độc lập** (159.8ms, 298.4ms, 578.2ms, 317.0ms)
đều **cách xa mức `1.22ms` trong báo cáo ít nhất 100 lần** — củng cố thêm kết luận: con số báo cáo
không thể là round-trip HTTP+DB+Redis đầy đủ như script này đo.

## Kết luận cho Mục 5.4

Khuyến nghị dùng **khoảng TB 132–400ms** (tuỳ môi trường/thời điểm đo) thay cho `1.22ms/1.48ms`
trong Bảng hiệu năng, kèm chú thích rõ phạm vi đo (round-trip đầy đủ, không phải riêng thao tác nội
bộ BullMQ). Tỉ lệ thành công vẫn rất tốt: 3999/4000 request thành công qua 4 lần đo độc lập (local
x3 + hosted x1) = 99.98%.
