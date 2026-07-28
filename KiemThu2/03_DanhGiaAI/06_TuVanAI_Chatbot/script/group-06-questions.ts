/**
 * Danh sách 184 câu hỏi cho Nhóm 6 — Tư vấn AI (Chatbot), thiết kế để phủ hết 28 AI tools đăng ký
 * cho agent tài chính (17 Six Jars + 11 Scholarships — xem student360-ai/app/domains/finance/
 * agents/finance/composition.py, six_jars/tools/, scholarships/tools/).
 *
 * Mở rộng từ bộ 114 câu gốc để đánh giá chính xác hơn:
 *   - 26/28 tool: tăng từ 4 → 6 câu biến thể/tool (thêm độ phủ cách diễn đạt/tham số khác nhau).
 *   - get_budget_status và get_all_scholarships: tăng lên 10 câu biến thể/tool — đây là 2 tool có
 *     lỗi timeout TÁI LẬP ĐƯỢC đã ghi nhận ở lần chạy 114 câu gốc: get_budget_status timeout
 *     ở CẢ 2 lần thử với câu hỏi dạng "% ngân sách", còn get_all_scholarships timeout với câu hỏi
 *     dạng đếm số lượng ("Hiện có bao nhiêu học bổng...") nhưng KHÔNG timeout với câu hỏi liệt kê
 *     cùng tool ("Liệt kê tất cả học bổng..."). Thêm nhiều biến thể theo TỪNG DẠNG CÂU HỎI khác
 *     nhau (số lượng/tỷ lệ %/liệt kê/lọc theo điều kiện) để xác định lỗi nằm ở cách agent xử lý
 *     dạng câu hỏi cụ thể nào, không phải toàn bộ tool bị hỏng.
 *   - Câu tổng quát: tăng từ 2 → 8 câu, thêm các câu hỏi ghép nhiều chủ đề (composite) và câu hỏi
 *     mơ hồ (không rõ tool nào phù hợp) để kiểm tra khả năng agent tự chọn tool hợp lý trong tình
 *     huống không tường minh.
 *   Tổng: 26*6 + 2*10 + 8 = 156 + 20 + 8 = 184.
 *
 * LƯU Ý: việc tool nào thực sự được LLM gọi phụ thuộc vào intent classification + quyết định của
 * model — câu hỏi ở đây chỉ là "cố gắng kích hoạt", không đảm bảo 100% tool được gọi đúng như dự
 * định. Độ phủ thực tế phải được xác minh lại qua log AI Service sau khi chạy (xem README.md).
 */

export interface QuestionSpec {
  targetTool: string;
  question: string;
}

export const QUESTIONS: QuestionSpec[] = [
  // 1. get_jar_balance
  { targetTool: 'get_jar_balance', question: 'Lọ chi tiêu thiết yếu của tôi còn bao nhiêu tiền?' },
  { targetTool: 'get_jar_balance', question: 'Số dư hiện tại của lọ giáo dục là bao nhiêu?' },
  { targetTool: 'get_jar_balance', question: 'Lọ hưởng thụ còn lại bao nhiêu tiền để tôi chi tiêu?' },
  { targetTool: 'get_jar_balance', question: 'Cho tôi biết số dư lọ dự phòng ngay bây giờ.' },
  { targetTool: 'get_jar_balance', question: 'Lọ đầu tư của tôi hiện có bao nhiêu tiền?' },
  { targetTool: 'get_jar_balance', question: 'Kiểm tra giúp tôi số dư lọ chia sẻ hiện tại.' },

  // 2. get_jar_allocations
  { targetTool: 'get_jar_allocations', question: 'Cho tôi xem tổng quan 6 lọ tài chính của tôi.' },
  { targetTool: 'get_jar_allocations', question: 'Hiện tại tôi đang phân bổ bao nhiêu % vào mỗi lọ?' },
  { targetTool: 'get_jar_allocations', question: 'Danh sách 6 lọ kèm số dư từng lọ hiện tại là gì?' },
  { targetTool: 'get_jar_allocations', question: 'Tóm tắt tình hình tất cả các lọ tài chính giúp tôi.' },
  { targetTool: 'get_jar_allocations', question: 'Tỷ lệ chia tiền hiện tại của tôi cho từng lọ là bao nhiêu phần trăm?' },
  { targetTool: 'get_jar_allocations', question: 'Cho tôi xem toàn bộ cấu trúc 6 lọ đang thiết lập.' },

  // 3. get_jar_statistics
  { targetTool: 'get_jar_statistics', question: 'Từ trước đến giờ lọ giáo dục tôi đã thu chi tổng cộng bao nhiêu?' },
  { targetTool: 'get_jar_statistics', question: 'Thống kê toàn bộ dòng tiền của lọ thiết yếu từ lúc tạo tới giờ.' },
  { targetTool: 'get_jar_statistics', question: 'Lọ đầu tư của tôi có tổng thu chi lũy kế như thế nào?' },
  { targetTool: 'get_jar_statistics', question: 'Cho tôi số liệu tổng quan lịch sử của lọ hưởng thụ.' },
  { targetTool: 'get_jar_statistics', question: 'Tính đến bây giờ lọ chia sẻ đã có tổng cộng bao nhiêu giao dịch?' },
  { targetTool: 'get_jar_statistics', question: 'Lọ dự phòng của tôi từ khi tạo đến nay biến động thế nào?' },

  // 4. get_recent_transactions
  { targetTool: 'get_recent_transactions', question: 'Cho tôi xem 10 giao dịch gần đây nhất của tôi.' },
  { targetTool: 'get_recent_transactions', question: 'Gần đây tôi đã chi tiêu những khoản nào?' },
  { targetTool: 'get_recent_transactions', question: 'Liệt kê các giao dịch mới nhất trên tất cả các lọ.' },
  { targetTool: 'get_recent_transactions', question: 'Tôi vừa mới tiêu tiền vào những việc gì gần đây?' },
  { targetTool: 'get_recent_transactions', question: 'Cho tôi xem 5 giao dịch mới nhất của lọ thiết yếu.' },
  { targetTool: 'get_recent_transactions', question: 'Hôm nay tôi có phát sinh giao dịch nào không?' },

  // 5. get_top_expenses
  { targetTool: 'get_top_expenses', question: 'Tháng này tôi tiêu nhiều nhất vào việc gì?' },
  { targetTool: 'get_top_expenses', question: '10 khoản chi lớn nhất trong 30 ngày qua của tôi là gì?' },
  { targetTool: 'get_top_expenses', question: 'Khoản chi tiêu lớn nhất gần đây của tôi là khoản nào?' },
  { targetTool: 'get_top_expenses', question: 'Cho tôi biết những chi tiêu đáng kể nhất tuần vừa rồi.' },
  { targetTool: 'get_top_expenses', question: '5 khoản chi tiêu tốn kém nhất của lọ giải trí trong tháng là gì?' },
  { targetTool: 'get_top_expenses', question: 'Xếp hạng các khoản chi lớn nhất từ đầu tháng đến giờ.' },

  // 6. search_transactions
  { targetTool: 'search_transactions', question: "Tìm giúp tôi giao dịch nào có chữ 'Grab' trong mô tả." },
  { targetTool: 'search_transactions', question: "Tôi có giao dịch nào liên quan đến 'cà phê' không?" },
  { targetTool: 'search_transactions', question: "Tìm kiếm các giao dịch có từ 'học phí'." },
  { targetTool: 'search_transactions', question: "Có giao dịch nào chứa từ 'sách' trong mô tả không?" },
  { targetTool: 'search_transactions', question: "Tìm các giao dịch có ghi chú 'tiền nhà' giúp tôi." },
  { targetTool: 'search_transactions', question: "Trước đây tôi có giao dịch nào ghi 'sinh nhật' không?" },

  // 7. get_jar_tags
  { targetTool: 'get_jar_tags', question: 'Lọ hưởng thụ tôi đang gắn những tag nào?' },
  { targetTool: 'get_jar_tags', question: 'Danh sách tag đang hoạt động của lọ thiết yếu là gì?' },
  { targetTool: 'get_jar_tags', question: 'Tôi đã tạo những tag nào cho lọ giải trí?' },
  { targetTool: 'get_jar_tags', question: 'Cho tôi xem các tag của lọ dự phòng.' },
  { targetTool: 'get_jar_tags', question: 'Lọ giáo dục hiện có bao nhiêu tag đang dùng?' },
  { targetTool: 'get_jar_tags', question: 'Tag nào đang được gắn cho lọ đầu tư của tôi?' },

  // 8. get_budget_status (deprecated alias) — TOOL CÓ LỖI TIMEOUT TÁI LẬP ĐƯỢC, 10 biến thể để
  // khoanh vùng lỗi theo DẠNG câu hỏi (số tiền còn lại / % đã dùng / tình trạng chung / so hạn mức).
  { targetTool: 'get_budget_status', question: 'Ngân sách lọ thiết yếu tháng này còn lại bao nhiêu?' },
  { targetTool: 'get_budget_status', question: 'Tình trạng ngân sách của lọ giải trí hiện tại ra sao?' },
  { targetTool: 'get_budget_status', question: 'Tôi đã dùng hết bao nhiêu % ngân sách lọ ăn uống?' },
  { targetTool: 'get_budget_status', question: 'Ngân sách còn lại của lọ hưởng thụ tháng này là bao nhiêu?' },
  { targetTool: 'get_budget_status', question: 'Tôi đã tiêu hết bao nhiêu phần trăm ngân sách lọ thiết yếu?' },
  { targetTool: 'get_budget_status', question: 'Lọ giáo dục còn bao nhiêu % ngân sách chưa dùng đến?' },
  { targetTool: 'get_budget_status', question: 'Ngân sách lọ đầu tư tháng này tôi đã xài quá hạn mức chưa?' },
  { targetTool: 'get_budget_status', question: 'Tình hình sử dụng ngân sách lọ dự phòng hiện ra sao?' },
  { targetTool: 'get_budget_status', question: 'So với hạn mức ngân sách, lọ chia sẻ của tôi đang ở mức nào?' },
  { targetTool: 'get_budget_status', question: 'Ngân sách lọ hưởng thụ, tôi đã dùng gần hết chưa?' },

  // 9. get_tag_spending_summary
  { targetTool: 'get_tag_spending_summary', question: 'Tháng 5 tôi chi bao nhiêu cho từng tag trong lọ thiết yếu?' },
  { targetTool: 'get_tag_spending_summary', question: 'Tổng hợp chi tiêu theo tag của tháng trước giúp tôi.' },
  { targetTool: 'get_tag_spending_summary', question: 'Tag nào tôi chi nhiều tiền nhất trong tháng này?' },
  { targetTool: 'get_tag_spending_summary', question: 'Phân tích chi tiêu theo từng tag của tháng hiện tại.' },
  { targetTool: 'get_tag_spending_summary', question: 'Cho tôi bảng chi tiêu theo tag của lọ giải trí tháng này.' },
  { targetTool: 'get_tag_spending_summary', question: 'Trong tháng 4, tag nào chiếm tỷ trọng chi tiêu cao nhất?' },

  // 10. get_monthly_summary
  { targetTool: 'get_monthly_summary', question: 'Tổng kết thu chi tháng 3 của tôi như thế nào?' },
  { targetTool: 'get_monthly_summary', question: 'Tháng trước tôi thu và chi tổng cộng bao nhiêu?' },
  { targetTool: 'get_monthly_summary', question: 'Cho tôi báo cáo tổng quan thu chi tháng này.' },
  { targetTool: 'get_monthly_summary', question: 'Tóm tắt tài chính tháng 6 của tôi.' },
  { targetTool: 'get_monthly_summary', question: 'Tháng 2 tôi có dư ra được đồng nào không?' },
  { targetTool: 'get_monthly_summary', question: 'Tổng thu nhập và chi tiêu tháng hiện tại là bao nhiêu?' },

  // 11. compare_spending_between_two_months
  { targetTool: 'compare_spending_between_two_months', question: 'So sánh chi tiêu tháng này với tháng trước giúp tôi.' },
  { targetTool: 'compare_spending_between_two_months', question: 'Tháng 4 và tháng 5 tôi chi tiêu khác nhau thế nào?' },
  { targetTool: 'compare_spending_between_two_months', question: 'Chi tiêu của tôi tháng này tăng hay giảm so với tháng trước?' },
  { targetTool: 'compare_spending_between_two_months', question: 'So sánh thu nhập 2 tháng gần nhất của tôi.' },
  { targetTool: 'compare_spending_between_two_months', question: 'Tháng 1 so với tháng 3, tôi tiêu nhiều hơn hay ít hơn?' },
  { targetTool: 'compare_spending_between_two_months', question: 'Đối chiếu chi tiêu lọ thiết yếu giữa tháng này và tháng trước.' },

  // 12. get_spending_trend
  { targetTool: 'get_spending_trend', question: 'Xu hướng chi tiêu lọ thiết yếu trong 6 tháng qua của tôi thế nào?' },
  { targetTool: 'get_spending_trend', question: 'Chi tiêu lọ giải trí có xu hướng tăng hay giảm gần đây?' },
  { targetTool: 'get_spending_trend', question: 'Cho tôi xem biến động chi tiêu lọ giáo dục vài tháng qua.' },
  { targetTool: 'get_spending_trend', question: 'Xu hướng thu chi lọ dự phòng gần đây ra sao?' },
  { targetTool: 'get_spending_trend', question: 'Trong 3 tháng gần nhất, chi tiêu lọ đầu tư của tôi biến động ra sao?' },
  { targetTool: 'get_spending_trend', question: 'Cho tôi biểu đồ xu hướng chi tiêu tổng thể nửa năm qua.' },

  // 13. get_auto_transfers
  { targetTool: 'get_auto_transfers', question: 'Tôi có đang cài lịch tự động chia tiền không?' },
  { targetTool: 'get_auto_transfers', question: 'Danh sách các lịch chuyển tiền tự động đang hoạt động của tôi.' },
  { targetTool: 'get_auto_transfers', question: 'Tôi đã thiết lập tự động phân bổ thu nhập chưa?' },
  { targetTool: 'get_auto_transfers', question: 'Cho tôi xem các lịch tự động đang bật.' },
  { targetTool: 'get_auto_transfers', question: 'Có lịch chuyển tiền tự động nào của tôi đang tạm dừng không?' },
  { targetTool: 'get_auto_transfers', question: 'Tôi có bao nhiêu lịch tự động chia tiền đang chạy?' },

  // 14. can_afford_this
  { targetTool: 'can_afford_this', question: 'Tôi có nên mua bàn phím cơ giá 3 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Tôi có đủ khả năng mua một chiếc laptop 15 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Với tình hình tài chính hiện tại, tôi có nên mua tai nghe 2 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Tôi có nên chi 5 triệu để đi du lịch cuối năm không?' },
  { targetTool: 'can_afford_this', question: 'Mua một đôi giày 1.5 triệu có ảnh hưởng nhiều đến tài chính của tôi không?' },
  { targetTool: 'can_afford_this', question: 'Tôi có đủ tiền để đăng ký khóa học 4 triệu đồng không?' },

  // 15. compare_jar_allocation
  { targetTool: 'compare_jar_allocation', question: 'Phân bổ lọ của tôi có hợp lý theo phương pháp 6 lọ chuẩn không?' },
  { targetTool: 'compare_jar_allocation', question: 'So sánh cách tôi đang chia tiền với tỷ lệ 6 lọ khuyến nghị.' },
  { targetTool: 'compare_jar_allocation', question: 'Tỷ lệ phân bổ hiện tại của tôi lệch bao nhiêu so với chuẩn?' },
  { targetTool: 'compare_jar_allocation', question: 'Đánh giá xem cách chia lọ của tôi có đúng nguyên tắc 6 lọ không.' },
  { targetTool: 'compare_jar_allocation', question: 'Lọ nào của tôi đang lệch nhiều nhất so với tỷ lệ khuyến nghị?' },
  { targetTool: 'compare_jar_allocation', question: 'Cách chia 6 lọ của tôi có cần điều chỉnh gì không?' },

  // 16. suggest_jar_rebalancing
  { targetTool: 'suggest_jar_rebalancing', question: 'Giúp tôi tái cân bằng lại tỷ lệ các lọ tài chính.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Đề xuất cách phân bổ lại 6 lọ cho hợp lý hơn.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Tôi nên điều chỉnh % các lọ như thế nào cho tốt hơn?' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Gợi ý tỷ lệ phân bổ mới dựa trên chi tiêu thực tế của tôi.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Lọ giải trí đang chi vượt quá nhiều, giúp tôi cân bằng lại các lọ.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Nếu muốn tiết kiệm nhiều hơn thì tôi nên chỉnh lại tỷ lệ lọ ra sao?' },

  // 17. get_financial_guidelines
  { targetTool: 'get_financial_guidelines', question: 'Làm sao để quản lý nợ hiệu quả khi là sinh viên?' },
  { targetTool: 'get_financial_guidelines', question: 'Thu nhập không đều thì nên chia lọ như thế nào?' },
  { targetTool: 'get_financial_guidelines', question: 'Có lời khuyên nào về việc đặt mục tiêu tiết kiệm không?' },
  { targetTool: 'get_financial_guidelines', question: 'Cho tôi vài mẹo quản lý tài chính dành cho sinh viên.' },
  { targetTool: 'get_financial_guidelines', question: 'Phương pháp 6 lọ hoạt động theo nguyên tắc nào?' },
  { targetTool: 'get_financial_guidelines', question: 'Sinh viên mới đi làm thêm nên bắt đầu quản lý tiền từ đâu?' },

  // 18. find_scholarship_id_by_name
  { targetTool: 'find_scholarship_id_by_name', question: "Học bổng có tên gần giống 'Vươn Cao' thì ID là gì?" },
  { targetTool: 'find_scholarship_id_by_name', question: "Tìm giúp tôi ID của học bổng tên có chữ 'Khuyến khích'." },
  { targetTool: 'find_scholarship_id_by_name', question: "Học bổng nào tên gần giống 'Tài năng' vậy, cho tôi ID." },
  { targetTool: 'find_scholarship_id_by_name', question: "Tìm ID học bổng có tên chứa từ 'Sinh viên'." },
  { targetTool: 'find_scholarship_id_by_name', question: "ID của học bổng có tên gần giống 'Xuất Sắc' là gì?" },
  { targetTool: 'find_scholarship_id_by_name', question: "Tìm giúp tôi mã học bổng có tên chứa từ 'Nghị Lực'." },

  // 19. get_scholarship_details
  { targetTool: 'get_scholarship_details', question: 'Học bổng đầu tiên trong danh sách đang mở yêu cầu GPA bao nhiêu?' },
  { targetTool: 'get_scholarship_details', question: 'Chi tiết điều kiện và giấy tờ cần nộp cho học bổng đang phổ biến nhất là gì?' },
  { targetTool: 'get_scholarship_details', question: 'Học bổng có hạn nộp sớm nhất yêu cầu những gì?' },
  { targetTool: 'get_scholarship_details', question: 'Cho tôi biết chi tiết đầy đủ của một học bổng bất kỳ đang mở.' },
  { targetTool: 'get_scholarship_details', question: 'Giá trị và quyền lợi của học bổng đang mở gần bạn nhất là gì?' },
  { targetTool: 'get_scholarship_details', question: 'Học bổng đang mở có giá trị cao nhất yêu cầu hồ sơ gì?' },

  // 20. get_all_scholarships — TOOL CÓ LỖI TIMEOUT TÁI LẬP ĐƯỢC (chỉ với dạng câu hỏi "đếm số
  // lượng"), 10 biến thể để khoanh vùng lỗi theo DẠNG câu hỏi (liệt kê / đếm / lọc theo trường /
  // lọc theo trạng thái).
  { targetTool: 'get_all_scholarships', question: 'Liệt kê tất cả học bổng đang mở hiện tại.' },
  { targetTool: 'get_all_scholarships', question: 'Hiện có bao nhiêu học bổng đang nhận hồ sơ?' },
  { targetTool: 'get_all_scholarships', question: 'Cho tôi danh sách đầy đủ các học bổng hiện có.' },
  { targetTool: 'get_all_scholarships', question: 'Trường tôi hiện đang có những học bổng nào?' },
  { targetTool: 'get_all_scholarships', question: 'Có tổng cộng bao nhiêu học bổng trong hệ thống?' },
  { targetTool: 'get_all_scholarships', question: 'Đếm giúp tôi số lượng học bổng đang còn hạn nộp.' },
  { targetTool: 'get_all_scholarships', question: 'Liệt kê toàn bộ học bổng, kể cả đã đóng hạn nộp.' },
  { targetTool: 'get_all_scholarships', question: 'Có bao nhiêu học bổng đang tạm đóng hồ sơ?' },
  { targetTool: 'get_all_scholarships', question: 'Xem tất cả học bổng hiện có trên hệ thống.' },
  { targetTool: 'get_all_scholarships', question: 'Số lượng học bổng đang mở hiện tại là bao nhiêu?' },

  // 21. get_my_full_profile
  { targetTool: 'get_my_full_profile', question: 'Xem lại hồ sơ đầy đủ của tôi (học vấn, kỹ năng, sở thích) để tư vấn học bổng phù hợp.' },
  { targetTool: 'get_my_full_profile', question: 'Hồ sơ cá nhân của tôi hiện đang có những thông tin gì?' },
  { targetTool: 'get_my_full_profile', question: 'Dựa vào toàn bộ hồ sơ của tôi, tôi phù hợp với loại học bổng nào?' },
  { targetTool: 'get_my_full_profile', question: 'Tóm tắt hồ sơ học vấn và kỹ năng hiện tại của tôi.' },
  { targetTool: 'get_my_full_profile', question: 'Hồ sơ của tôi hiện có thiếu thông tin gì không?' },
  { targetTool: 'get_my_full_profile', question: 'Cho tôi xem lại toàn bộ thông tin cá nhân đã khai báo.' },

  // 22. get_my_scholarship_applications
  { targetTool: 'get_my_scholarship_applications', question: 'Tôi đang apply những học bổng nào rồi?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Danh sách hồ sơ học bổng tôi đã nộp là gì?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Hồ sơ nào của tôi đang chờ xét duyệt?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Tôi đã nộp bao nhiêu hồ sơ học bổng từ trước đến giờ?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Có hồ sơ học bổng nào của tôi bị từ chối không?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Cho tôi xem toàn bộ lịch sử apply học bổng của tôi.' },

  // 23. get_scholarship_application_detail
  { targetTool: 'get_scholarship_application_detail', question: 'Hồ sơ apply học bổng gần nhất của tôi còn thiếu giấy tờ gì không?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Tôi có khả năng đậu học bổng mà tôi vừa apply không?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Trạng thái xét duyệt hồ sơ học bổng của tôi hiện ra sao?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Xem chi tiết lịch sử xét duyệt hồ sơ học bổng gần nhất của tôi.' },
  { targetTool: 'get_scholarship_application_detail', question: 'Hồ sơ học bổng tôi nộp tuần trước hiện đang ở bước nào?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Cho tôi xem chi tiết đầy đủ 1 hồ sơ học bổng tôi đã nộp.' },

  // 24. get_scholarship_recommendations_for_chat
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Gợi ý học bổng phù hợp với hồ sơ của tôi.' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Học bổng nào tôi nên apply dựa trên thông tin hiện tại?' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Đề xuất giúp tôi vài học bổng phù hợp nhất.' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Với hồ sơ của tôi thì học bổng nào khả thi nhất?' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Dựa trên ngành học của tôi, học bổng nào đáng cân nhắc?' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Gợi ý 3 học bổng tôi có cơ hội đậu cao nhất.' },

  // 25. search_scholarship_recommendations_by_criteria
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Học bổng nào yêu cầu GPA từ 3.2 trở lên và hạn nộp trong tháng tới?' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Tìm học bổng của trường Đại học Bách Khoa cho tôi.' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Có học bổng nào dành riêng cho ngành Công nghệ thông tin không?' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Tìm học bổng có giá trị từ 5 triệu trở lên.' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Học bổng nào yêu cầu GPA dưới 3.0, phù hợp cho hoàn cảnh khó khăn?' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Tìm học bổng do doanh nghiệp tài trợ, không yêu cầu GPA cao.' },

  // 26. get_scholarship_recommendations_for_described_profile
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Bạn tôi GPA 3.5, ngành Công nghệ thông tin, năm 3 — gợi ý học bổng phù hợp cho bạn ấy.' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Em họ tôi học ngành Kinh tế, GPA 3.0, năm 2 — có học bổng nào phù hợp không?' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Một bạn sinh viên ngành Sư phạm, hoàn cảnh khó khăn, GPA 3.4 thì nên apply học bổng nào?' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Bạn cùng phòng tôi học Khoa học máy tính, GPA 3.7, thích nghiên cứu AI — gợi ý học bổng giúp bạn ấy.' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Người quen tôi học ngành Y đa khoa, GPA 3.6, năm 4 — học bổng nào phù hợp?' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Bạn tôi học Tài chính - Ngân hàng, GPA 3.2, thích đầu tư chứng khoán — gợi ý học bổng giúp bạn ấy.' },

  // 27. get_latest_scholarship_recommendations_for_chat
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Học bổng nào mới được cập nhật gần đây nhất?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Gần đây có học bổng mới nào không?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Cho tôi xem các học bổng vừa được thêm vào hệ thống.' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Học bổng mới nhất hiện tại là gì?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Tuần này có học bổng nào mới xuất hiện không?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Danh sách học bổng mới cập nhật trong tháng này.' },

  // 28. match_scholarships_for_profile
  { targetTool: 'match_scholarships_for_profile', question: 'Xếp hạng học bổng phù hợp cho hồ sơ: ngành Khoa học máy tính, trường Đại học Khoa học Tự nhiên, kỹ năng Python và Machine Learning, sở thích nghiên cứu AI.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Với profile: major=Công nghệ thông tin, university=Bách Khoa, skills=[Java, SQL], hãy xếp hạng học bổng phù hợp.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Xếp hạng độ phù hợp học bổng cho hồ sơ: ngành Kinh tế, GPA 3.6, kỹ năng phân tích dữ liệu, sở thích tài chính.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Dựa trên hồ sơ JSON sau, xếp hạng học bổng: {"major": "Sinh học", "university": "KHTN", "interests": ["nghiên cứu", "công nghệ sinh học"]}.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Xếp hạng học bổng cho hồ sơ: ngành Kế toán, trường Đại học Kinh tế Quốc dân, GPA 3.3, kỹ năng kiểm toán.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Với hồ sơ: major=Kỹ thuật điện, university=Đại học Bách Khoa Hà Nội, skills=[PLC, autocad], xếp hạng học bổng phù hợp nhất.' },

  // 8 câu tổng quát / mơ hồ / ghép nhiều chủ đề (không nhắm riêng 1 tool, kiểm tra khả năng agent
  // tự chọn tool hợp lý khi câu hỏi không tường minh về tool nào cần dùng)
  { targetTool: '(tổng quát)', question: 'Tổng hợp giúp tôi tình hình tài chính và cơ hội học bổng hiện tại của tôi.' },
  { targetTool: '(tổng quát)', question: 'Tôi nên làm gì để vừa quản lý tiền tốt hơn vừa tăng cơ hội nhận học bổng?' },
  { targetTool: '(tổng quát)', question: 'Tình hình của tôi dạo này thế nào?' },
  { targetTool: '(tổng quát)', question: 'Tôi nên ưu tiên việc gì trước: tiết kiệm tiền hay nộp hồ sơ học bổng?' },
  { targetTool: '(tổng quát)', question: 'Nếu tôi đậu học bổng sắp tới thì nên phân bổ số tiền đó vào lọ nào cho hợp lý?' },
  { targetTool: '(tổng quát)', question: 'Cho tôi lời khuyên tổng thể để cải thiện tình hình tài chính và học tập của tôi.' },
  { targetTool: '(tổng quát)', question: 'Có gì đáng chú ý về tiền bạc và học bổng của tôi tuần này không?' },
  { targetTool: '(tổng quát)', question: 'Giúp tôi lên kế hoạch tài chính cho học kỳ tới, có tính đến khả năng nhận học bổng.' },
];

if (QUESTIONS.length !== 184) {
  throw new Error(`Kỳ vọng đúng 184 câu hỏi, hiện có ${QUESTIONS.length}`);
}
