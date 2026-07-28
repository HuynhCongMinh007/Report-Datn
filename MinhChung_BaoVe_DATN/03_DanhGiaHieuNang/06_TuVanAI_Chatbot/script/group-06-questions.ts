/**
 * Danh sách 114 câu hỏi cho Nhóm 6 — Tư vấn AI (Chatbot), thiết kế để phủ hết 28 AI tools đăng ký
 * cho agent tài chính (17 Six Jars + 11 Scholarships — xem student360-ai/app/domains/finance/
 * agents/finance/composition.py, six_jars/tools/, scholarships/tools/).
 *
 * Mỗi tool có 4 câu hỏi biến thể (khác cách diễn đạt/tham số) để vừa đạt độ phủ vừa "chia đều",
 * cộng 2 câu tổng quát → 28*4 + 2 = 114, khớp đúng số lượt trong báo cáo.
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

  // 2. get_jar_allocations
  { targetTool: 'get_jar_allocations', question: 'Cho tôi xem tổng quan 6 lọ tài chính của tôi.' },
  { targetTool: 'get_jar_allocations', question: 'Hiện tại tôi đang phân bổ bao nhiêu % vào mỗi lọ?' },
  { targetTool: 'get_jar_allocations', question: 'Danh sách 6 lọ kèm số dư từng lọ hiện tại là gì?' },
  { targetTool: 'get_jar_allocations', question: 'Tóm tắt tình hình tất cả các lọ tài chính giúp tôi.' },

  // 3. get_jar_statistics
  { targetTool: 'get_jar_statistics', question: 'Từ trước đến giờ lọ giáo dục tôi đã thu chi tổng cộng bao nhiêu?' },
  { targetTool: 'get_jar_statistics', question: 'Thống kê toàn bộ dòng tiền của lọ thiết yếu từ lúc tạo tới giờ.' },
  { targetTool: 'get_jar_statistics', question: 'Lọ đầu tư của tôi có tổng thu chi lũy kế như thế nào?' },
  { targetTool: 'get_jar_statistics', question: 'Cho tôi số liệu tổng quan lịch sử của lọ hưởng thụ.' },

  // 4. get_recent_transactions
  { targetTool: 'get_recent_transactions', question: 'Cho tôi xem 10 giao dịch gần đây nhất của tôi.' },
  { targetTool: 'get_recent_transactions', question: 'Gần đây tôi đã chi tiêu những khoản nào?' },
  { targetTool: 'get_recent_transactions', question: 'Liệt kê các giao dịch mới nhất trên tất cả các lọ.' },
  { targetTool: 'get_recent_transactions', question: 'Tôi vừa mới tiêu tiền vào những việc gì gần đây?' },

  // 5. get_top_expenses
  { targetTool: 'get_top_expenses', question: 'Tháng này tôi tiêu nhiều nhất vào việc gì?' },
  { targetTool: 'get_top_expenses', question: '10 khoản chi lớn nhất trong 30 ngày qua của tôi là gì?' },
  { targetTool: 'get_top_expenses', question: 'Khoản chi tiêu lớn nhất gần đây của tôi là khoản nào?' },
  { targetTool: 'get_top_expenses', question: 'Cho tôi biết những chi tiêu đáng kể nhất tuần vừa rồi.' },

  // 6. search_transactions
  { targetTool: 'search_transactions', question: "Tìm giúp tôi giao dịch nào có chữ 'Grab' trong mô tả." },
  { targetTool: 'search_transactions', question: "Tôi có giao dịch nào liên quan đến 'cà phê' không?" },
  { targetTool: 'search_transactions', question: "Tìm kiếm các giao dịch có từ 'học phí'." },
  { targetTool: 'search_transactions', question: "Có giao dịch nào chứa từ 'sách' trong mô tả không?" },

  // 7. get_jar_tags
  { targetTool: 'get_jar_tags', question: 'Lọ hưởng thụ tôi đang gắn những tag nào?' },
  { targetTool: 'get_jar_tags', question: 'Danh sách tag đang hoạt động của lọ thiết yếu là gì?' },
  { targetTool: 'get_jar_tags', question: 'Tôi đã tạo những tag nào cho lọ giải trí?' },
  { targetTool: 'get_jar_tags', question: 'Cho tôi xem các tag của lọ dự phòng.' },

  // 8. get_budget_status (deprecated alias)
  { targetTool: 'get_budget_status', question: 'Ngân sách lọ thiết yếu tháng này còn lại bao nhiêu?' },
  { targetTool: 'get_budget_status', question: 'Tình trạng ngân sách của lọ giải trí hiện tại ra sao?' },
  { targetTool: 'get_budget_status', question: 'Tôi đã dùng hết bao nhiêu % ngân sách lọ ăn uống?' },
  { targetTool: 'get_budget_status', question: 'Ngân sách còn lại của lọ hưởng thụ tháng này là bao nhiêu?' },

  // 9. get_tag_spending_summary
  { targetTool: 'get_tag_spending_summary', question: 'Tháng 5 tôi chi bao nhiêu cho từng tag trong lọ thiết yếu?' },
  { targetTool: 'get_tag_spending_summary', question: 'Tổng hợp chi tiêu theo tag của tháng trước giúp tôi.' },
  { targetTool: 'get_tag_spending_summary', question: 'Tag nào tôi chi nhiều tiền nhất trong tháng này?' },
  { targetTool: 'get_tag_spending_summary', question: 'Phân tích chi tiêu theo từng tag của tháng hiện tại.' },

  // 10. get_monthly_summary
  { targetTool: 'get_monthly_summary', question: 'Tổng kết thu chi tháng 3 của tôi như thế nào?' },
  { targetTool: 'get_monthly_summary', question: 'Tháng trước tôi thu và chi tổng cộng bao nhiêu?' },
  { targetTool: 'get_monthly_summary', question: 'Cho tôi báo cáo tổng quan thu chi tháng này.' },
  { targetTool: 'get_monthly_summary', question: 'Tóm tắt tài chính tháng 6 của tôi.' },

  // 11. compare_spending_between_two_months
  { targetTool: 'compare_spending_between_two_months', question: 'So sánh chi tiêu tháng này với tháng trước giúp tôi.' },
  { targetTool: 'compare_spending_between_two_months', question: 'Tháng 4 và tháng 5 tôi chi tiêu khác nhau thế nào?' },
  { targetTool: 'compare_spending_between_two_months', question: 'Chi tiêu của tôi tháng này tăng hay giảm so với tháng trước?' },
  { targetTool: 'compare_spending_between_two_months', question: 'So sánh thu nhập 2 tháng gần nhất của tôi.' },

  // 12. get_spending_trend
  { targetTool: 'get_spending_trend', question: 'Xu hướng chi tiêu lọ thiết yếu trong 6 tháng qua của tôi thế nào?' },
  { targetTool: 'get_spending_trend', question: 'Chi tiêu lọ giải trí có xu hướng tăng hay giảm gần đây?' },
  { targetTool: 'get_spending_trend', question: 'Cho tôi xem biến động chi tiêu lọ giáo dục vài tháng qua.' },
  { targetTool: 'get_spending_trend', question: 'Xu hướng thu chi lọ dự phòng gần đây ra sao?' },

  // 13. get_auto_transfers
  { targetTool: 'get_auto_transfers', question: 'Tôi có đang cài lịch tự động chia tiền không?' },
  { targetTool: 'get_auto_transfers', question: 'Danh sách các lịch chuyển tiền tự động đang hoạt động của tôi.' },
  { targetTool: 'get_auto_transfers', question: 'Tôi đã thiết lập tự động phân bổ thu nhập chưa?' },
  { targetTool: 'get_auto_transfers', question: 'Cho tôi xem các lịch tự động đang bật.' },

  // 14. can_afford_this
  { targetTool: 'can_afford_this', question: 'Tôi có nên mua bàn phím cơ giá 3 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Tôi có đủ khả năng mua một chiếc laptop 15 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Với tình hình tài chính hiện tại, tôi có nên mua tai nghe 2 triệu không?' },
  { targetTool: 'can_afford_this', question: 'Tôi có nên chi 5 triệu để đi du lịch cuối năm không?' },

  // 15. compare_jar_allocation
  { targetTool: 'compare_jar_allocation', question: 'Phân bổ lọ của tôi có hợp lý theo phương pháp 6 lọ chuẩn không?' },
  { targetTool: 'compare_jar_allocation', question: 'So sánh cách tôi đang chia tiền với tỷ lệ 6 lọ khuyến nghị.' },
  { targetTool: 'compare_jar_allocation', question: 'Tỷ lệ phân bổ hiện tại của tôi lệch bao nhiêu so với chuẩn?' },
  { targetTool: 'compare_jar_allocation', question: 'Đánh giá xem cách chia lọ của tôi có đúng nguyên tắc 6 lọ không.' },

  // 16. suggest_jar_rebalancing
  { targetTool: 'suggest_jar_rebalancing', question: 'Giúp tôi tái cân bằng lại tỷ lệ các lọ tài chính.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Đề xuất cách phân bổ lại 6 lọ cho hợp lý hơn.' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Tôi nên điều chỉnh % các lọ như thế nào cho tốt hơn?' },
  { targetTool: 'suggest_jar_rebalancing', question: 'Gợi ý tỷ lệ phân bổ mới dựa trên chi tiêu thực tế của tôi.' },

  // 17. get_financial_guidelines
  { targetTool: 'get_financial_guidelines', question: 'Làm sao để quản lý nợ hiệu quả khi là sinh viên?' },
  { targetTool: 'get_financial_guidelines', question: 'Thu nhập không đều thì nên chia lọ như thế nào?' },
  { targetTool: 'get_financial_guidelines', question: 'Có lời khuyên nào về việc đặt mục tiêu tiết kiệm không?' },
  { targetTool: 'get_financial_guidelines', question: 'Cho tôi vài mẹo quản lý tài chính dành cho sinh viên.' },

  // 18. find_scholarship_id_by_name
  { targetTool: 'find_scholarship_id_by_name', question: "Học bổng có tên gần giống 'Vươn Cao' thì ID là gì?" },
  { targetTool: 'find_scholarship_id_by_name', question: "Tìm giúp tôi ID của học bổng tên có chữ 'Khuyến khích'." },
  { targetTool: 'find_scholarship_id_by_name', question: "Học bổng nào tên gần giống 'Tài năng' vậy, cho tôi ID." },
  { targetTool: 'find_scholarship_id_by_name', question: "Tìm ID học bổng có tên chứa từ 'Sinh viên'." },

  // 19. get_scholarship_details
  { targetTool: 'get_scholarship_details', question: 'Học bổng đầu tiên trong danh sách đang mở yêu cầu GPA bao nhiêu?' },
  { targetTool: 'get_scholarship_details', question: 'Chi tiết điều kiện và giấy tờ cần nộp cho học bổng đang phổ biến nhất là gì?' },
  { targetTool: 'get_scholarship_details', question: 'Học bổng có hạn nộp sớm nhất yêu cầu những gì?' },
  { targetTool: 'get_scholarship_details', question: 'Cho tôi biết chi tiết đầy đủ của một học bổng bất kỳ đang mở.' },

  // 20. get_all_scholarships
  { targetTool: 'get_all_scholarships', question: 'Liệt kê tất cả học bổng đang mở hiện tại.' },
  { targetTool: 'get_all_scholarships', question: 'Hiện có bao nhiêu học bổng đang nhận hồ sơ?' },
  { targetTool: 'get_all_scholarships', question: 'Cho tôi danh sách đầy đủ các học bổng hiện có.' },
  { targetTool: 'get_all_scholarships', question: 'Trường tôi hiện đang có những học bổng nào?' },

  // 21. get_my_full_profile
  { targetTool: 'get_my_full_profile', question: 'Xem lại hồ sơ đầy đủ của tôi (học vấn, kỹ năng, sở thích) để tư vấn học bổng phù hợp.' },
  { targetTool: 'get_my_full_profile', question: 'Hồ sơ cá nhân của tôi hiện đang có những thông tin gì?' },
  { targetTool: 'get_my_full_profile', question: 'Dựa vào toàn bộ hồ sơ của tôi, tôi phù hợp với loại học bổng nào?' },
  { targetTool: 'get_my_full_profile', question: 'Tóm tắt hồ sơ học vấn và kỹ năng hiện tại của tôi.' },

  // 22. get_my_scholarship_applications
  { targetTool: 'get_my_scholarship_applications', question: 'Tôi đang apply những học bổng nào rồi?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Danh sách hồ sơ học bổng tôi đã nộp là gì?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Hồ sơ nào của tôi đang chờ xét duyệt?' },
  { targetTool: 'get_my_scholarship_applications', question: 'Tôi đã nộp bao nhiêu hồ sơ học bổng từ trước đến giờ?' },

  // 23. get_scholarship_application_detail
  { targetTool: 'get_scholarship_application_detail', question: 'Hồ sơ apply học bổng gần nhất của tôi còn thiếu giấy tờ gì không?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Tôi có khả năng đậu học bổng mà tôi vừa apply không?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Trạng thái xét duyệt hồ sơ học bổng của tôi hiện ra sao?' },
  { targetTool: 'get_scholarship_application_detail', question: 'Xem chi tiết lịch sử xét duyệt hồ sơ học bổng gần nhất của tôi.' },

  // 24. get_scholarship_recommendations_for_chat
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Gợi ý học bổng phù hợp với hồ sơ của tôi.' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Học bổng nào tôi nên apply dựa trên thông tin hiện tại?' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Đề xuất giúp tôi vài học bổng phù hợp nhất.' },
  { targetTool: 'get_scholarship_recommendations_for_chat', question: 'Với hồ sơ của tôi thì học bổng nào khả thi nhất?' },

  // 25. search_scholarship_recommendations_by_criteria
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Học bổng nào yêu cầu GPA từ 3.2 trở lên và hạn nộp trong tháng tới?' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Tìm học bổng của trường Đại học Bách Khoa cho tôi.' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Có học bổng nào dành riêng cho ngành Công nghệ thông tin không?' },
  { targetTool: 'search_scholarship_recommendations_by_criteria', question: 'Tìm học bổng có giá trị từ 5 triệu trở lên.' },

  // 26. get_scholarship_recommendations_for_described_profile
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Bạn tôi GPA 3.5, ngành Công nghệ thông tin, năm 3 — gợi ý học bổng phù hợp cho bạn ấy.' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Em họ tôi học ngành Kinh tế, GPA 3.0, năm 2 — có học bổng nào phù hợp không?' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Một bạn sinh viên ngành Sư phạm, hoàn cảnh khó khăn, GPA 3.4 thì nên apply học bổng nào?' },
  { targetTool: 'get_scholarship_recommendations_for_described_profile', question: 'Bạn cùng phòng tôi học Khoa học máy tính, GPA 3.7, thích nghiên cứu AI — gợi ý học bổng giúp bạn ấy.' },

  // 27. get_latest_scholarship_recommendations_for_chat
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Học bổng nào mới được cập nhật gần đây nhất?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Gần đây có học bổng mới nào không?' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Cho tôi xem các học bổng vừa được thêm vào hệ thống.' },
  { targetTool: 'get_latest_scholarship_recommendations_for_chat', question: 'Học bổng mới nhất hiện tại là gì?' },

  // 28. match_scholarships_for_profile
  { targetTool: 'match_scholarships_for_profile', question: 'Xếp hạng học bổng phù hợp cho hồ sơ: ngành Khoa học máy tính, trường Đại học Khoa học Tự nhiên, kỹ năng Python và Machine Learning, sở thích nghiên cứu AI.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Với profile: major=Công nghệ thông tin, university=Bách Khoa, skills=[Java, SQL], hãy xếp hạng học bổng phù hợp.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Xếp hạng độ phù hợp học bổng cho hồ sơ: ngành Kinh tế, GPA 3.6, kỹ năng phân tích dữ liệu, sở thích tài chính.' },
  { targetTool: 'match_scholarships_for_profile', question: 'Dựa trên hồ sơ JSON sau, xếp hạng học bổng: {"major": "Sinh học", "university": "KHTN", "interests": ["nghiên cứu", "công nghệ sinh học"]}.' },

  // 2 câu tổng quát (không nhắm riêng 1 tool, kiểm tra khả năng agent tự chọn tool hợp lý)
  { targetTool: '(tổng quát)', question: 'Tổng hợp giúp tôi tình hình tài chính và cơ hội học bổng hiện tại của tôi.' },
  { targetTool: '(tổng quát)', question: 'Tôi nên làm gì để vừa quản lý tiền tốt hơn vừa tăng cơ hội nhận học bổng?' },
];

if (QUESTIONS.length !== 114) {
  throw new Error(`Kỳ vọng đúng 114 câu hỏi, hiện có ${QUESTIONS.length}`);
}
