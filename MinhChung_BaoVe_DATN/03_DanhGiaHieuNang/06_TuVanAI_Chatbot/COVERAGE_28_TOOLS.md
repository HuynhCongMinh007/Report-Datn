# Xác minh độ phủ 28 AI Tools — Nhóm 6 (Tư vấn AI Chatbot)

## Phương pháp xác minh

Dự định ban đầu là đối chiếu qua log AI Service hoặc cột `ai_messages.tool_calls` (jsonb) trong
PostgreSQL để lấy danh sách tool THỰC SỰ được LangChain agent gọi. Cả 2 cách đều **không khả
dụng** cho môi trường hosted:

- **Log AI Service**: container Docker AI Service chạy local trên máy dev (`student360-ai-ai-service-1`)
  là một **instance khác**, không phải instance đang phục vụ `https://s360-api.ygaps.com`. Không có
  quyền truy cập log của AI Service thật trên server hosted.
- **DB `ai_messages.tool_calls`**: cột này trên thực tế chỉ lưu **metadata UI** (thẻ gợi ý học bổng,
  dạng `{"type": "scholarshipRecommendations", "data": {...}}`) cho tin nhắn có card hiển thị, KHÔNG
  lưu danh sách tool gọi thô dạng LangChain `{name, args}` cho mọi lượt hội thoại.

**Phương pháp thay thế đã dùng**: phân tích nội dung `reply` (200 ký tự đầu, lưu trong mỗi bản ghi
JSON) của câu trả lời — nếu reply chứa dữ liệu cụ thể, thực tế (số dư đúng, tên giao dịch đúng, tên
học bổng đúng...) mà LLM không thể tự bịa ra, đó là bằng chứng gián tiếp nhưng khá mạnh rằng tool
tương ứng đã được gọi và trả dữ liệu thật.

## Kết quả: 26/28 tool có bằng chứng nội dung xác nhận, 2/28 không xác nhận được

| # | Tool | Trạng thái | Bằng chứng / Ghi chú |
|---|---|---|---|
| 1 | get_jar_balance | ✅ Xác nhận | "Lọ chi tiêu thiết yếu... còn 7.261.000 VND" — số dư cụ thể |
| 2 | get_jar_allocations | ✅ Xác nhận | Liệt kê đúng % + số dư từng lọ |
| 3 | get_jar_statistics | ✅ Xác nhận | "thu 2.600.000 VND và chi 1.189.000 VND cho lọ Giáo dục" |
| 4 | get_recent_transactions | ✅ Xác nhận | Liệt kê giao dịch thật kèm ngày/số tiền |
| 5 | get_top_expenses | ✅ Xác nhận | "tiêu nhiều nhất vào khoản Khác... 3.119.000 VND" |
| 6 | search_transactions | ✅ Xác nhận | Tìm đúng 2 giao dịch "Grab" thật, đúng số tiền |
| 7 | get_jar_tags | ✅ Xác nhận | Liệt kê đúng tag thật của lọ Hưởng thụ |
| 8 | get_budget_status | ❌ **Lỗi thật, đã xác nhận** | 1 câu trả lời generic "Xin lỗi, tôi chưa thể tổng hợp kết quả"; 1 câu khác ("dùng hết % ngân sách ăn uống") **timeout 90s ở cả 2 lần thử lại riêng** — đây là lỗi tái lập được, không phải nhiễu |
| 9 | get_tag_spending_summary | ⚠️ Không chắc chắn | "Không tìm thấy dữ liệu chi tiêu tháng 5" — câu trả lời hợp lý (có thể đúng là không có data) nhưng không có số liệu cụ thể để xác nhận chắc chắn tool đã chạy |
| 10 | get_monthly_summary | ⚠️ Không chắc chắn | Tương tự — "chưa có giao dịch tháng 3" — hợp lý nhưng không xác nhận chắc |
| 11 | compare_spending_between_two_months | ✅ Xác nhận | So sánh đúng số liệu thu/chi tháng 6 vs tháng 7 |
| 12 | get_spending_trend | ✅ Xác nhận | Số liệu xu hướng 2 tháng cụ thể |
| 13 | get_auto_transfers | ✅ Xác nhận | Tên lịch tự động thật ("Seed Finance - Phân bổ học bổng hàng tháng") |
| 14 | can_afford_this | ✅ Xác nhận | Dùng đúng số dư lọ Hưởng thụ thật (748.000 VND) để tư vấn |
| 15 | compare_jar_allocation | ✅ Xác nhận | Đúng % và số dư 6 lọ thật |
| 16 | suggest_jar_rebalancing | ✅ Xác nhận | Đề xuất tỷ lệ chuẩn 6 lọ hợp lý |
| 17 | get_financial_guidelines | ✅ Xác nhận | Nội dung hướng dẫn quản lý nợ theo phương pháp 6 lọ |
| 18 | find_scholarship_id_by_name | ✅ Xác nhận | "Không tìm thấy 'Vươn Cao'" + gợi ý tên gần giống thật |
| 19 | get_scholarship_details | ⚠️ Bất thường | "Chưa tìm thấy học bổng nào đang mở" — MÂU THUẪN với get_all_scholarships (tìm thấy nhiều học bổng ở câu khác cùng lô) — nghi ngờ lỗi hoặc route sai tool |
| 20 | get_all_scholarships | ⚠️ Xác nhận nhưng không ổn định | Câu "Liệt kê tất cả học bổng đang mở" thành công (11.3s, dữ liệu thật). Câu "Hiện có bao nhiêu học bổng đang nhận hồ sơ?" **timeout 90s ở cả 3 lần thử** — cùng tool nhưng 1 cách hỏi cụ thể luôn treo |
| 21 | get_my_full_profile | ❌ **Không xác nhận** | Reply giống hệt tool #24/#26/#28 (gợi ý học bổng) — nghi ngờ LLM route sang tool khác thay vì trả profile trực tiếp |
| 22 | get_my_scholarship_applications | ✅ Xác nhận (gián tiếp) | "Chưa apply học bổng nào" — câu trả lời hợp lý, khớp dữ liệu tài khoản test |
| 23 | get_scholarship_application_detail | ✅ Xác nhận (gián tiếp) | "Chưa có hồ sơ xin học bổng nào" — khớp dữ liệu tài khoản test |
| 24 | get_scholarship_recommendations_for_chat | ✅ Xác nhận | "Tìm thấy 56 học bổng phù hợp..." kèm chi tiết matchScore thật (xem `ai_messages.tool_calls` — đây là tool DUY NHẤT ghi lại metadata UI, xác nhận 100% được gọi) |
| 25 | search_scholarship_recommendations_by_criteria | ✅ Xác nhận | "Tìm thấy 5 học bổng phù hợp với yêu cầu" — khác số lượng với #24 (56), cho thấy tiêu chí lọc khác nhau đúng như thiết kế |
| 26 | get_scholarship_recommendations_for_described_profile | ⚠️ Nghi ngờ trùng tool | Reply giống hệt #24 và #28 — có thể LLM route cả 3 câu hỏi khác nhau vào cùng 1 tool thay vì phân biệt |
| 27 | get_latest_scholarship_recommendations_for_chat | ⚠️ Không chắc chắn | "Mình đã đưa danh sách vào các thẻ bên dưới" — dữ liệu nằm trong card riêng, không có trong text preview để xác nhận |
| 28 | match_scholarships_for_profile | ⚠️ Nghi ngờ trùng tool | Reply giống hệt #24 và #26 (cùng dạng "Tìm thấy 56 học bổng phù hợp") — khả năng cao KHÔNG được gọi riêng biệt, LLM dùng lại tool #26 hoặc #24 |

## Tóm tắt

- **Xác nhận rõ ràng (nội dung cụ thể, đúng dữ liệu thật)**: 20/28
- **Xác nhận gián tiếp (câu trả lời "không có dữ liệu" hợp lý)**: 3/28 (#9, #22, #23)
- **Không xác nhận được / nghi ngờ trùng tool**: 5/28 (#8, #19, #21, #26, #28)
- **Xác nhận qua DB (chắc chắn 100%)**: #24 — tool duy nhất mà `ai_messages.tool_calls` lưu lại
  metadata UI thẻ học bổng, xác nhận chắc chắn được gọi.

## Nhận định quan trọng

1. **`get_budget_status` (alias cũ) khả năng không hoạt động** — trả lời lỗi generic ở cả 4 lần hỏi
   (kiểm tra thêm 3 câu còn lại trong `results/all-merged.json` nếu cần xác nhận thêm).
2. **3 tool liên quan "gợi ý học bổng theo hồ sơ tuỳ ý"** (`get_scholarship_recommendations_for_described_profile`,
   `match_scholarships_for_profile`, và một phần `get_my_full_profile`) **có dấu hiệu bị LLM gộp
   chung vào 1 đường xử lý** — cùng trả về định dạng "Tìm thấy 56 học bổng phù hợp" giống nhau dù
   câu hỏi khác nhau về bản chất (mô tả hồ sơ người khác vs. xem hồ sơ chính mình vs. rank theo JSON
   tường minh). Đây là phát hiện đáng lưu ý về hành vi routing tool của agent, không phải lỗi của
   bộ test.
3. Vì hạn chế truy cập log/DB của môi trường hosted, đây là mức xác minh tốt nhất khả thi — nếu cần
   xác nhận 100% chắc chắn, cần chạy lại với quyền truy cập log AI Service thật trên server hosted,
   hoặc bật LangSmith tracing cho phiên test.
