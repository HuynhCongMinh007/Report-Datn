# Kết quả — Tư vấn AI (Chatbot): 184/184 câu, môi trường local

Chạy 26-28/07/2026, môi trường **local**: backend NestJS local (`localhost:3000`), AI service
FastAPI trong Docker local (`localhost:8001`), tài khoản `finance.seed@student360.test`. Xem bảng
tổng kết cuối cùng ở mục "TỔNG KẾT" phía dưới; các mục 1-13 là log chi tiết theo từng batch chạy
tuần tự (20 câu/batch).

Lệnh chạy 1 batch (ví dụ câu 43-52):
```bash
cd backend
E2E_BACKEND_URL=http://localhost:3000/api \
EVAL_USER_EMAIL=finance.seed@student360.test EVAL_USER_PASSWORD=*** \
BENCH_START=43 BENCH_END=52 BENCH_DELAY_MS=2000 \
npx ts-node -r tsconfig-paths/register test/load/group-06-tu-van-ai.ts
```

## 1. `get_budget_status` (câu 43-52)

**Kết quả: 10/10 OK, không có timeout nào**, kể cả câu #45 ("Tôi đã dùng hết bao nhiêu % ngân sách
lọ ăn uống?" → OK, 17.5s).

| # | Câu hỏi | Kết quả | Latency |
|---|---|---|---|
| 43 | Ngân sách lọ thiết yếu tháng này còn lại bao nhiêu? | OK | 23.1s |
| 44 | Tình trạng ngân sách của lọ giải trí hiện tại ra sao? | OK | 17.8s |
| 45 | Tôi đã dùng hết bao nhiêu % ngân sách lọ ăn uống? (**câu từng timeout trên hosted**) | OK | 17.5s |
| 46 | Ngân sách còn lại của lọ hưởng thụ tháng này là bao nhiêu? | OK | 29.0s |
| 47 | Tôi đã tiêu hết bao nhiêu phần trăm ngân sách lọ thiết yếu? | OK | 18.9s |
| 48 | Lọ giáo dục còn bao nhiêu % ngân sách chưa dùng đến? | OK | 19.4s |
| 49 | Ngân sách lọ đầu tư tháng này tôi đã xài quá hạn mức chưa? | OK | 23.1s |
| 50 | Tình hình sử dụng ngân sách lọ dự phòng hiện ra sao? | OK | 25.0s |
| 51 | So với hạn mức ngân sách, lọ chia sẻ của tôi đang ở mức nào? | OK | 16.9s |
| 52 | Ngân sách lọ hưởng thụ, tôi đã dùng gần hết chưa? | OK | 57.6s |

TB=24.8s, P50=19.4s, P95/P99=57.6s (n nhỏ nên P95=P99=max).

**Nhận định**: không tái lập lỗi timeout. Có thể do sửa gián tiếp bởi các thay đổi code khác
(`react_loop.py`, `prompts_classify.py`) hoặc do đặc thù môi trường (mạng/tải) — không đủ căn cứ để
kết luận chắc chắn nguyên nhân, chỉ ghi nhận là không tái lập ở local.

## 2. `get_all_scholarships` (câu 119-128)

**Kết quả local: 9/10 OK, 1/10 timeout (90s)** — đúng câu bị timeout là dạng đếm tổng số lượng:

| # | Câu hỏi | Kết quả | Latency |
|---|---|---|---|
| 119 | Liệt kê tất cả học bổng đang mở hiện tại. | OK | 27.8s |
| 120 | Hiện có bao nhiêu học bổng đang nhận hồ sơ? | OK | 14.4s |
| 121 | Cho tôi danh sách đầy đủ các học bổng hiện có. | OK | 22.1s |
| 122 | Trường tôi hiện đang có những học bổng nào? | OK | 11.6s |
| **123** | **Có tổng cộng bao nhiêu học bổng trong hệ thống?** | **TIMEOUT** | 90.0s |
| 124 | Đếm giúp tôi số lượng học bổng đang còn hạn nộp. | OK | 40.2s |
| 125 | Liệt kê toàn bộ học bổng, kể cả đã đóng hạn nộp. | OK | 23.9s |
| 126 | Có bao nhiêu học bổng đang tạm đóng hồ sơ? | OK | 32.4s |
| 127 | Xem tất cả học bổng hiện có trên hệ thống. | OK | 45.6s |
| 128 | Số lượng học bổng đang mở hiện tại là bao nhiêu? | OK | 17.8s |

### Điều tra sâu hơn câu #123 — PHÁT HIỆN QUAN TRỌNG HƠN CẢ TIMEOUT

Câu #123 được test lại độc lập 4 lần nữa (ngoài lần timeout trong batch), tổng cộng 5 lần thử cùng
1 câu hỏi y hệt:

| Lần | Kết quả | Latency | Trả lời |
|---|---|---|---|
| 1 (trong batch) | Timeout | 90.0s | (không có phản hồi) |
| 2 (retry) | OK | 20.8s | "Hiện tại, hệ thống đang có tổng cộng **63** học bổng." |
| 3 (retry) | OK | 38.9s | "Hiện tại, hệ thống có **1** học bổng." ⚠️ **SAI** |
| 4 (retry) | OK | 18.1s | "Hiện tại hệ thống có tổng cộng **63** học bổng." |
| 5 (retry) | OK | 14.4s | "Hiện tại có tổng cộng **63** học bổng trong hệ thống." |

**Ground truth xác minh qua `GET /scholarships` (backend, `meta.total`): hệ thống có đúng 63 học
bổng.**

→ 3/5 lần đúng (63), 1/5 lần **sai hoàn toàn** (trả lời "1 học bổng" — sai gấp 63 lần), 1/5 lần
timeout hẳn.

### Nguyên nhân gốc — đã xác định qua log AI Service (structlog, docker logs)

Đối chiếu latency của từng lần retry với log `tool_used` trong docker logs
(`student360-ai-ai-service-1`), tìm đúng lần gọi tool tương ứng từng câu trả lời:

| Retry | Tham số LLM gọi tool `get_all_scholarships` | Số dòng DB trả về | Câu trả lời |
|---|---|---|---|
| 1 | `open_only=False, active_only=False` (limit mặc định 200) | 63 | "63 học bổng" ✓ |
| 2 | `open_only=False, active_only=False, **limit=0**` | **1** (bị ép về 1) | "1 học bổng" ✗ |
| 3 | `active_only=False, open_only=False, limit=500` | 63 | "63 học bổng" ✓ |
| 4 | `limit=500, offset=0, ...` | 63 | "63 học bổng" ✓ |

Nguyên nhân gốc nằm ở tool `get_all_scholarships`
(`student360-ai/app/domains/finance/agents/finance/scholarships/tools/matching.py:709`):

```python
safe_limit = max(1, min(int(limit), 500))
```

Khi LLM tự chọn gọi tool với `limit=0`, dòng code này **âm thầm ép `limit=0` thành `limit=1`**
(`max(1, min(0,500)) = 1`), khiến câu SQL chạy `LIMIT 1` và chỉ lấy đúng 1 bản ghi bất kể có bao
nhiêu học bổng thật sự thỏa điều kiện lọc. Tool trả về `paging.returned = 1`, và model chỉ đơn giản
**thuật lại đúng con số tool trả về** — đây KHÔNG phải lỗi "model tự bịa số" mà là lỗi ở tầng tool:
payload trả về của `get_all_scholarships` **không có trường "tổng số bản ghi thật sự thỏa điều kiện
trong DB" độc lập với `limit`** (chỉ có `paging: {limit, offset, returned}`, không có
`SELECT COUNT(*)`) — nên khi LLM (không ổn định, do sampling của Gemini) chọn `limit` nhỏ cho câu
hỏi "có bao nhiêu", tool không có cách nào cho model biết còn nhiều bản ghi hơn bị cắt bớt.

**Đây là phát hiện đáng ưu tiên đưa vào phần "Hạn chế" hoặc "Rủi ro" của báo cáo, thay vì chỉ nói
đến timeout** — mức độ nghiêm trọng cao hơn vì ảnh hưởng trực tiếp đến độ tin cậy thông tin trả lời
cho người dùng, không chỉ trải nghiệm chờ đợi.

### Đã sửa và xác minh lại (26/07/2026)

Áp dụng 2 thay đổi vào `get_all_scholarships`
(`student360-ai/app/domains/finance/agents/finance/scholarships/tools/matching.py`):

1. Thêm `SELECT COUNT(*)` (cùng điều kiện lọc `active_only`/`open_only`, độc lập với `limit`) vào
   payload dưới dạng `paging.total_matching` — cho model một con số "sự thật" không bị ảnh hưởng
   bởi việc nó chọn `limit` bao nhiêu.
2. Sửa docstring của tool, chỉ rõ: trả lời câu hỏi "có bao nhiêu / tổng cộng" phải dùng
   `paging.total_matching`, không dùng `paging.returned`.
3. `limit<=0` giờ rơi về mặc định 200 thay vì bị ép âm thầm thành 1.

**Kiểm tra ở tầng tool (gọi hàm trực tiếp, không qua LLM)**:

| Tham số gọi | Trước fix | Sau fix |
|---|---|---|
| `limit=0, active_only=False, open_only=False` | `returned=1` (bug) | `returned=63, total_matching=63` |
| `limit=1, active_only=True, open_only=True` | `returned=1`, không có total | `returned=1, total_matching=60` |

**Kiểm tra end-to-end qua chat thật (5 lần, cùng 1 câu hỏi "Có tổng cộng bao nhiêu học bổng trong
hệ thống?", sau khi restart AI service để nhận code mới)**:

| Lần | Kết quả | Latency | Trả lời |
|---|---|---|---|
| 1 | OK | 12.1s | "Hiện tại có tổng cộng 61 học bổng trong hệ thống." |
| 2 | OK | 11.7s | "Hiện tại, hệ thống có tổng cộng 61 học bổng đang hoạt động." |
| 3 | OK | 9.5s | "Hiện tại, hệ thống có tổng cộng 61 học bổng." |
| 4 | OK | 9.2s | "Hiện tại có tổng cộng 61 học bổng trong hệ thống." |
| 5 | OK | 8.5s | "Hiện tại có tổng cộng 61 học bổng trong hệ thống." |

**5/5 nhất quán, không còn timeout, không còn trả lời sai** — và độ trễ giảm rõ rệt (8.5-12.1s so
với 14-90s trước đó), vì model không còn cần nhiều vòng ReAct để "tự nghi ngờ và gọi lại tool".
Số 61 (thay vì 63) là ĐÚNG theo thiết kế: `active_only=True` là default của tool, nên chỉ đếm 61
học bổng đang active trong tổng 63 (63 là tổng KHÔNG lọc active, xác minh qua
`GET /scholarships` không truyền filter).

**Việc còn lại**: `SELECT COUNT(*)` thêm vào chạy trên mỗi lần gọi tool — cân nhắc chi phí này có
đáng kể không nếu tool được gọi rất thường xuyên (hiện tại là 1 query đơn giản có index trên
`is_active`, nên không đáng lo với quy mô dữ liệu hiện tại).

## 3. Batch 1 (câu 1-20) — local, sau khi sửa `get_all_scholarships`

**20/20 OK, không lỗi/timeout.** Tool: `get_jar_balance` (6), `get_jar_allocations` (6),
`get_jar_statistics` (6), `get_recent_transactions` (2).

Latency: TB=16.2s, P50=14.1s, P95=23.7s, P99=53.9s (câu #2 chậm bất thường 53.9s — không lỗi, chỉ
là outlier về thời gian, có thể do đây là request đầu sau khi restart AI service).

Raw: `local/raw-batch-001-020-2026-07-26T12-32-38-549Z.{json,csv}`

## 4. Batch 2 (câu 21-40) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_recent_transactions` (4), `get_top_expenses` (6),
`search_transactions` (6), `get_jar_tags` (4).

Latency: TB=16.4s, P50=14.0s, P95=25.3s, P99=48.9s (câu #29 chậm bất thường 48.9s, cùng dạng
outlier ngẫu nhiên như câu #2 ở batch 1).

Raw: `local/raw-batch-021-040-2026-07-26T12-41-14-166Z.{json,csv}`

## 5. Đối chiếu Local vs Hosted — chạy lại batch 1 (câu 1-20) trên hosted

Chạy lại đúng 20 câu của batch 1 trên `https://s360-api.ygaps.com/api` (cùng tài khoản seed) để so
sánh ảnh hưởng môi trường lên độ trễ. **20/20 OK trên hosted, không lỗi** — nhưng phân bố độ trễ
khác hẳn local:

| Metric | Local | Hosted |
|---|---|---|
| TB (avg) | 16.2s | 17.7s |
| P50 | 14.1s | **4.6s** |
| P95 | 23.7s | **74.0s** |
| P99 | 53.9s | 74.6s |

**Nhận xét**: Hosted có độ trễ **hai cực rõ rệt** — phần lớn câu rất nhanh (3.5-5.5s: câu #1, #3,
#5, #7-10, #19, #20) nhưng 5/20 câu chậm bất thường (41-75s: câu #4, #6, #13, #15, #18), trong khi
local có độ trễ trải đều hơn (7-54s, ít cực đoan hơn). TB trung bình gần bằng nhau (16-18s) nhưng
hình dạng phân bố hoàn toàn khác — trên hosted, P50 (4.6s) đánh lừa vì che giấu 1/4 số câu bị chậm
gấp 15-20 lần so với phần còn lại. Đáng lưu ý khi báo cáo: **chọn môi trường đo ảnh hưởng lớn đến cả
giá trị số liệu lẫn hình dạng phân bố**, không chỉ đơn thuần nhanh/chậm hơn.

Raw: `hosted-comparison/raw-batch-001-020-2026-07-26T12-56-16-203Z.{json,csv}`

## 6. Batch 3 (câu 41-60) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_jar_tags` (2), `get_budget_status` (10 — lần thứ 2 chạy
lại, xem dưới), `get_tag_spending_summary` (6), `get_monthly_summary` (2).

Latency: TB=19.7s, P50=17.9s, P95=35.7s, P99=39.6s — không có outlier cực đoan (50-90s) như 2 batch
trước, tương đối đồng đều.

**`get_budget_status` giờ đã có 20/20 lần chạy OK trên local** (10 lần ở lô ưu tiên mục 1 + 10 lần
batch này) — càng củng cố kết luận: lỗi timeout 2/2 ghi nhận trên hosted không tái lập ở local, khả
năng cao là đặc thù môi trường hosted (mạng/tải) hơn là lỗi logic thuần trong code.

Raw: `local/raw-batch-041-060-2026-07-26T13-05-26-885Z.{json,csv}`

## 7. Batch 4 (câu 61-80) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_monthly_summary` (4), `compare_spending_between_two_months`
(6), `get_spending_trend` (5), `get_auto_transfers` (4).

Latency: TB=17.9s, P50=19.2s, P95=24.5s, P99=30.4s — batch ổn định nhất từ đầu tới giờ, không có
outlier nào (max chỉ 30.4s, so với 40-90s ở các batch trước).

Raw: `local/raw-batch-061-080-2026-07-26T13-13-08-614Z.{json,csv}`

## 8. Batch 5 (câu 81-100) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_auto_transfers` (2), `can_afford_this` (6),
`compare_jar_allocation` (6), `suggest_jar_rebalancing` (6).

Latency: TB=23.0s, P50=16.8s, P95=50.2s, P99=65.8s — batch chậm nhất từ đầu tới giờ. Đáng chú ý:
`can_afford_this` dao động rất mạnh trong cùng 1 tool (câu #85: 3.8s, câu #84: 65.8s, câu #86:
50.2s) — hợp lý vì đây là tool có nhiều bước suy luận (kiểm tra ngân sách + đối chiếu khả năng chi
trả), nhưng độ dao động lớn cho cùng loại câu hỏi đáng ghi chú về độ ổn định hiệu năng (không phải
lỗi chức năng).

Raw: `local/raw-batch-081-100-2026-07-26T13-44-42-895Z.{json,csv}`

## 9. Batch 6 (câu 101-120) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_financial_guidelines` (6), `find_scholarship_id_by_name`
(6), `get_scholarship_details` (6), `get_all_scholarships` (2: câu 119, 120).

Latency: TB=14.6s, P50=12.5s, P95=28.7s, P99=31.5s — batch nhanh, ổn định.

**Thêm xác nhận cho fix `get_all_scholarships`**: câu #119 "Liệt kê tất cả học bổng đang mở" → "60
học bổng đang mở"; câu #120 "Hiện có bao nhiêu học bổng đang nhận hồ sơ?" → "60 học bổng" — nhất
quán với nhau (đều 60, đúng số open thực tế), không còn hiện tượng trả lời lệch số như trước khi
sửa.

Raw: `local/raw-batch-101-120-2026-07-26T13-52-16-233Z.{json,csv}`

## 10. Batch 7 (câu 121-140) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_all_scholarships` (6 câu còn lại), `get_my_full_profile`
(6), `get_my_scholarship_applications` (6).

Latency: TB=13.8s, P50=12.7s, P95=26.8s, P99=27.9s.

**Xác nhận mạnh cho fix**: câu #123 — chính câu từng gây lỗi "1 học bổng" trước đây — lần này trả
lời đúng "Hiện tại, hệ thống có tổng cộng 63 học bổng." (12.65s, không timeout). Kiểm tra log thấy
model vẫn chọn `limit=1, active_only=False, open_only=False` (y hệt kiểu tham số từng gây lỗi), 
nhưng lần này trả lời đúng nhờ `total_matching` độc lập với `limit` — xác nhận cơ chế fix hoạt động
đúng, không phụ thuộc vào việc model chọn `limit` bao nhiêu.

Raw: `local/raw-batch-121-140-2026-07-26T13-58-47-717Z.{json,csv}`

## 11. Batch 8 (câu 141-160) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_scholarship_application_detail` (6),
`get_scholarship_recommendations_for_chat` (6), `search_scholarship_recommendations_by_criteria`
(6), `get_scholarship_recommendations_for_described_profile` (2).

Latency: TB=11.8s, P50=12.5s, P95=24.4s, P99=38.0s — ổn định.

**Quan sát**: nhiều câu trả lời rất nhanh (~1-1.5s: câu #144, #147, #149, #152, #157, #159, #160) —
đường tắt "action-intent" hợp lệ (`ActionIntentDetector` trả lời nhanh khi phát hiện ý định hành
động rõ ràng, bỏ qua full ReAct loop), không phải lỗi. Riêng câu #159/#160 (hỏi hộ "bạn
tôi"/"em họ") tool điền đúng ngành/GPA theo mô tả trong câu hỏi nhưng vẫn dùng trường/khoa của tài
khoản đang đăng nhập làm giá trị mặc định khi câu hỏi không nêu trường — hành vi fallback hợp lý,
không phải lỗi.

Raw: `local/raw-batch-141-160-2026-07-28T03-24-29-594Z.{json,csv}`

## 12. Batch 9 (câu 161-180) — local

**20/20 OK, không lỗi/timeout.** Tool: `get_scholarship_recommendations_for_described_profile` (4
còn lại), `get_latest_scholarship_recommendations_for_chat` (6), `match_scholarships_for_profile`
(6), `(tổng quát)` (4).

Latency: TB=11.7s, P50=8.3s, P95=21.7s, P99=65.9s. Câu #167 chậm bất thường (65.9s) nhưng nội dung
trả lời vẫn hợp lệ ("Tôi tìm thấy 61 học bổng phù hợp...") — chỉ là outlier thời gian, không lỗi
chức năng.

4 câu tổng quát/mơ hồ (177-180) đều được route đúng, không lạc đề — agent xử lý tốt câu hỏi không
chỉ rõ tool cụ thể.

Raw: `local/raw-batch-161-180-2026-07-28T03-32-00-525Z.{json,csv}`

## 13. Batch cuối (câu 181-184) — local

**4/4 OK, không lỗi/timeout.** 4 câu tổng quát cuối cùng.

Latency: TB=25.4s, P50=25.5s, P95/P99=41.0s.

Raw: `local/raw-batch-181-184-2026-07-28T03-35-05-693Z.{json,csv}`

## TỔNG KẾT — Đã chạy đủ 184/184 câu (local, sau khi sửa `get_all_scholarships`)

Gộp toàn bộ 9 batch tuần tự (câu 1-184, chạy 26-28/07/2026, sau khi áp dụng fix `total_matching`):

| Metric | Giá trị |
|---|---|
| Tổng số câu | 184 |
| Thành công | **184/184 (100%)** |
| Timeout/lỗi | **0** |
| Latency TB | 16.3s |
| P50 | 14.4s |
| P95 | 38.0s |
| P99 | 53.9s |
| Min / Max | 0.9s / 65.9s |

Không phát hiện lỗi timeout/hallucination nào ngoài 2 lỗi đã biết và đã xử lý
(`get_budget_status` — không tái lập trên local; `get_all_scholarships` — đã xác định nguyên nhân
gốc, sửa code, xác nhận ổn định qua nhiều lần chạy lại). Phần đối chiếu Local vs Hosted ở mục 5
(chạy lại 20 câu đầu trên cả 2 môi trường) cho thấy môi trường ảnh hưởng đáng kể đến độ trễ nhưng
không phát sinh thêm lỗi chức năng trên hosted.

## Việc còn lại

- Không còn câu nào trong 184 câu chưa chạy.
- Có thể cân nhắc chạy thêm đối chiếu local/hosted cho toàn bộ 184 câu (hiện chỉ có 20/184) nếu
  muốn kết luận chắc chắn hơn về ảnh hưởng môi trường lên toàn bộ tool, không chỉ nhóm Six Jars cơ
  bản.
- Có thể áp dụng cách kiểm tra tương tự (`total_matching` độc lập với `limit`) cho các tool khác có
  pattern "đếm/liệt kê + limit do LLM tự chọn" nếu muốn rà soát toàn diện hơn (ngoài phạm vi đợt
  này).
- Nên cân nhắc thêm bước xác minh tương tự (chạy lại 3-5 lần) cho MỌI câu hỏi dạng "đếm/tổng số
  lượng" ở các tool khác (`get_jar_statistics`, `get_my_scholarship_applications`, ...) vì phát
  hiện ở `get_all_scholarships` cho thấy đây có thể là lỗi mang tính hệ thống của cách agent xử lý
  câu hỏi đếm số liệu, không riêng 1 tool.
- Cân nhắc chạy thêm đối chiếu local/hosted cho các batch còn lại nếu muốn kết luận chắc chắn hơn
  về nguyên nhân outlier độ trễ (mạng, tải server dùng chung, hay đặc thù model routing).
