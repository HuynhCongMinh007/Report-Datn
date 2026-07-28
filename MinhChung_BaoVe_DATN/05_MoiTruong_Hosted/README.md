# Kết quả kiểm thử trên backend đã host (https://s360-api.ygaps.com/api)

Chạy lại cùng bộ E2E (20 test case) và load test BullMQ (1.000 request, concurrency=10), cùng
tài khoản `finance.seed@student360.test`, nhưng target là backend **đã triển khai/host** thay vì
backend chạy native trên máy local (`localhost:3000`).

Cùng `accountId` (`43f53b7a-80e2-4290-a3c4-d0c0959a54fb`) đăng nhập được ở cả 2 môi trường — tức
2 backend (local & hosted) đang trỏ tới **cùng một cơ sở dữ liệu**, chỉ khác đường kết nối/vị trí
mạng.

## Kết quả

- E2E: **20/20 PASS**, tổng thời gian 14.5s (nhanh hơn nhiều so với 46.4s khi chạy từ máy local
  tới DB `103.82.36.202` — độ trễ AI/Gemini cũng thấp hơn đáng kể: classify 817ms so với 11.94s,
  chatbot stream 5.76s so với 25.53s).
- Load test BullMQ: **996/1000 thành công, 4 lỗi 404**; độ trễ TB **132.1ms**, P95 **221ms**, P99
  **1087ms**. **Vẫn không đạt** mức 1.22ms/1.48ms trong báo cáo — xem phân tích ở
  `../03_DanhGiaHieuNang/phan-tich-hieu-nang.md`, mục 3 (đã cập nhật).

## Ý nghĩa quan trọng cho Mục 5.4

Giả thuyết ban đầu ("độ trễ cao là do DB ở xa máy local đo") **không phải nguyên nhân chính** —
khi đo trực tiếp từ backend đã host (network path ngắn nhất có thể, backend-tới-DB nội bộ), độ
trễ TB vẫn ở mức **132.1ms**, cùng bậc độ lớn với lần đo từ máy local (159.8ms), không giảm về
mức ms/sub-ms như số liệu trong báo cáo. Điều này càng củng cố kết luận: số liệu `1.22ms/1.48ms`
trong báo cáo nhiều khả năng đo theo phương pháp khác (ví dụ chỉ đo lệnh `queue.add()` nội bộ,
không tính thời gian ghi PostgreSQL + toàn bộ round-trip HTTP) — **không phải do vị trí máy chạy
test**. Khuyến nghị cập nhật lại Bảng hiệu năng bằng 1 trong 2 bộ số đo thực tế này (khuyến nghị
dùng số liệu hosted vì gần với điều kiện vận hành thật của người dùng cuối hơn).

## Lưu ý về 4 lỗi 404

4/1000 request trả 404 khi chạy trên backend hosted (không xảy ra khi chạy từ local, 0/1000 lỗi).
Khả năng là hiện tượng thoáng qua ở tầng reverse proxy/gateway khi tải đồng thời cao, không phải
lỗi logic nghiệp vụ (endpoint đúng, cùng token, cùng payload cho mọi request). Nên điều tra thêm
nếu muốn đưa số liệu này vào báo cáo chính thức (VD: xem log Nginx/gateway phía server tại đúng
thời điểm 4 request đó).
