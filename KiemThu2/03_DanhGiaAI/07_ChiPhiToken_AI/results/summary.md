# Nhóm 7 — Chi phí Token AI — Kết quả tổng hợp

Model: **gemini-2.5-pro** (Vertex AI)
Tổng số câu hỏi: 62
Đạt: 62/62 (100.0%)

## Tổng hợp token/chi phí

- Tổng tokens vào: **816.923**
- Tổng tokens ra: **11.051**
- Tổng chi phí ước tính: **29.762,19 VND**
- TB tokens vào/request: **13176**
- TB tokens ra/request: **178**
- TB chi phí/request: **480,04 VND**

## Theo tool nhắm tới (dự định câu hỏi — chưa phải log thực tế agent đã gọi)

| Tool nhắm tới | N | TB tokens_in | TB tokens_out | TB cost_vnd | Tổng cost_vnd |
|---|---|---|---|---|---|
| (tổng quát) | 3 | 13860 | 463 | 577.49 | 1732.48 |
| can_afford_this | 2 | 8283 | 89 | 295.69 | 591.38 |
| compare_jar_allocation | 2 | 11336 | 314 | 455.23 | 910.46 |
| compare_spending_between_two_months | 2 | 11160 | 154 | 407.25 | 814.50 |
| find_scholarship_id_by_name | 2 | 13095 | 208 | 485.04 | 970.09 |
| get_all_scholarships | 3 | 58034 | 423 | 2019.16 | 6057.47 |
| get_auto_transfers | 2 | 11392 | 133 | 409.35 | 818.70 |
| get_budget_status | 4 | 13917 | 92 | 481.72 | 1926.87 |
| get_financial_guidelines | 2 | 2325 | 198 | 128.36 | 256.72 |
| get_jar_allocations | 2 | 11403 | 164 | 418.00 | 836.00 |
| get_jar_balance | 2 | 11038 | 34 | 371.81 | 743.62 |
| get_jar_statistics | 2 | 11115 | 85 | 387.75 | 775.51 |
| get_jar_tags | 2 | 11717 | 56 | 399.92 | 799.83 |
| get_latest_scholarship_recommendations_for_chat | 2 | 13223 | 63 | 451.27 | 902.53 |
| get_monthly_summary | 2 | 12333 | 625 | 569.68 | 1139.36 |
| get_my_full_profile | 2 | 15399 | 310 | 587.63 | 1175.26 |
| get_my_scholarship_applications | 2 | 12626 | 71 | 433.60 | 867.19 |
| get_recent_transactions | 2 | 12305 | 281 | 478.29 | 956.58 |
| get_scholarship_application_detail | 2 | 13621 | 115 | 478.03 | 956.05 |
| get_scholarship_details | 2 | 12540 | 68 | 430.11 | 860.22 |
| get_scholarship_recommendations_for_chat | 2 | 12840 | 79 | 442.75 | 885.50 |
| get_scholarship_recommendations_for_described_profile | 2 | 0 | 0 | 0.00 | 0.00 |
| get_spending_trend | 2 | 5499 | 45 | 192.61 | 385.22 |
| get_tag_spending_summary | 2 | 11515 | 130 | 412.59 | 825.18 |
| get_top_expenses | 2 | 12221 | 208 | 456.46 | 912.92 |
| match_scholarships_for_profile | 2 | 6464 | 62 | 228.79 | 457.58 |
| search_scholarship_recommendations_by_criteria | 2 | 6657 | 30 | 226.73 | 453.47 |
| search_transactions | 2 | 11312 | 100 | 398.03 | 796.05 |
| suggest_jar_rebalancing | 2 | 11372 | 395 | 477.73 | 955.46 |

## Ước tính chi phí ở quy mô (ngoại suy tuyến tính từ mẫu — KHÔNG phải đo thực tế)

| Giả định tin nhắn/user/tháng | Chi phí ước tính/user/tháng (VND) | Chi phí ước tính/1000 user/tháng (VND) |
|---|---|---|
| 5 | 2.400 | 2.400.177 |
| 20 | 9.601 | 9.600.707 |
| 60 | 28.802 | 28.802.120 |

## Câu hỏi lỗi

(không có)

## Giới hạn đã biết

- Chưa tính chi phí các lệnh gọi LLM phụ trong turn (intent classifier, action-intent detector,
  tool-refusal judge, action extractor) — số liệu là cận dưới, không phải tổng chi phí tuyệt đối.
- Giá áp dụng cho tier ngữ cảnh ≤200K token của Gemini 2.5 Pro trên Vertex AI, snapshot giá chụp
  ngày 2026-07-28 — cần re-check nếu GCP đổi giá.
- `targetTool` trong câu hỏi là "dự định kích hoạt", không đảm bảo model luôn gọi đúng tool đó.
