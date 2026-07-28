from langchain_core.messages import AIMessage, ToolMessage

from app.api.finance.chat import (
    _extract_scholarship_recommendations,
    _looks_like_raw_json,
    _synthesise_reply_from_tools,
)
from app.domains.finance.agents.finance.scholarships.tools.matching import (
    _build_recommendation_reply_hint,
    _extract_query_profile,
    _extract_requested_recommendation_count,
    _extract_scholarship_search_criteria,
    _resolve_recommendation_limit,
    _score_profile_match,
)


def test_synthesise_reply_from_get_jar_statistics_tool_output():
    tool_json = (
        "Record 1:\n"
        "{"
        '"jar_code":"ENJOYMENT",'
        '"name":"ENJOYMENT",'
        '"accumulated_income":1000000,'
        '"accumulated_expense":250000,'
        '"net_flow":750000,'
        '"current_balance":500000'
        "}"
    )

    messages = [
        AIMessage(content="", tool_calls=[{"id": "tc1", "name": "get_jar_statistics", "args": {}}]),
        ToolMessage(content=tool_json, tool_call_id="tc1"),
        AIMessage(content=""),
    ]

    reply = _synthesise_reply_from_tools(messages)
    assert reply is not None
    assert "Tổng thu" in reply
    assert "1.000.000 VND" in reply
    assert "250.000 VND" in reply
    assert "750.000 VND" in reply


def test_extract_scholarship_recommendations_from_tool_output():
    tool_json = {
        "reply_hint": "Tôi đã tìm thấy một số học bổng phù hợp với bạn. Nhấn vào từng thẻ để xem tóm tắt.",
        "scholarship_recommendations": {
            "kind": "scholarship_recommendations",
            "total_count": 15,
            "returned_count": 1,
            "has_more": True,
            "items": [
                {
                    "id": "scholarship_001",
                    "title": "MEXT Scholarship",
                    "majors": ["Computer Science"],
                    "coverage": "100% tuition",
                    "important_requirement": "GPA >= 3.2/4",
                    "requirements": {"gpa": "GPA >= 3.2/4", "other": []},
                    "benefits": ["Full tuition"],
                    "target_audience": ["Undergraduate"],
                }
            ],
        },
    }
    messages = [
        AIMessage(content="", tool_calls=[{"id": "tc1", "name": "get_scholarship_recommendations_for_chat", "args": {}}]),
        ToolMessage(content=__import__("json").dumps(tool_json), tool_call_id="tc1"),
        AIMessage(content=""),
    ]

    recommendations = _extract_scholarship_recommendations(messages)

    assert recommendations is not None
    assert recommendations.kind == "scholarship_recommendations"
    assert len(recommendations.items) == 1
    assert recommendations.items[0].title == "MEXT Scholarship"
    assert recommendations.total_count == 15
    assert recommendations.returned_count == 1
    assert recommendations.has_more is True


def test_scholarship_recommendation_tool_fallback_uses_short_hint_not_json():
    tool_json = (
        '{"reply_hint":"Tôi đã tìm thấy một số học bổng phù hợp với bạn. Nhấn vào từng thẻ để xem tóm tắt.",'
        '"scholarship_recommendations":{"kind":"scholarship_recommendations","items":['
        '{"id":"scholarship_001","title":"MEXT Scholarship"}]}}'
    )
    messages = [
        AIMessage(content="", tool_calls=[{"id": "tc1", "name": "get_scholarship_recommendations_for_chat", "args": {}}]),
        ToolMessage(content=tool_json, tool_call_id="tc1"),
        AIMessage(content=""),
    ]

    reply = _synthesise_reply_from_tools(messages)

    assert reply == "Tôi đã tìm thấy một số học bổng phù hợp với bạn. Nhấn vào từng thẻ để xem tóm tắt."
    assert not _looks_like_raw_json(reply)


def test_extract_requested_recommendation_count_from_user_query():
    assert _extract_requested_recommendation_count("Cho tôi 3 học bổng phù hợp nhất") == 3
    assert _extract_requested_recommendation_count("top 5 scholarships for CS") == 5
    assert _extract_requested_recommendation_count("give me 1 scholarship fit my profile") == 1
    assert _extract_requested_recommendation_count("gợi ý ba học bổng phù hợp") == 3
    assert _extract_requested_recommendation_count("gợi ý cho tôi 1 số học bổng phù hợp") is None


def test_resolve_recommendation_limit_defaults_to_top_three_and_honors_exact_count():
    assert _resolve_recommendation_limit("gợi ý học bổng phù hợp", 3) == (3, None, 0)
    assert _resolve_recommendation_limit("give me 1 scholarship fit my profile", 3) == (1, 1, 0)
    assert _resolve_recommendation_limit("xem thêm học bổng", 3) == (3, None, 3)
    assert _resolve_recommendation_limit("cho toi xem them 5 lua chon nua khac voi 3 lua chon tren", 3) == (
        5,
        5,
        3,
    )
    assert _resolve_recommendation_limit("xem them 3 hoc bong khac sau 6 lua chon truoc", 3) == (3, 3, 6)


def test_profile_match_ignores_generic_chat_words():
    score, matched_terms = _score_profile_match(
        {"keywords": "tim cho toi hoc bong phu hop voi sinh vien"},
        {
            "name": "General Student Scholarship",
            "description": "Scholarship for undergraduate students",
            "eligibility_criteria": None,
            "benefits": None,
            "provider": None,
            "category_name": None,
        },
    )

    assert score == 0
    assert matched_terms == []


def test_build_recommendation_reply_hint_includes_available_profile_fields():
    reply = _build_recommendation_reply_hint(
        {
            "major": "Computer Science",
            "faculty": "Software Engineering",
            "university": "FPT University",
            "gpa": 3.2,
        },
        has_items=True,
        total_count=15,
        returned_count=3,
    )

    assert "15 học bổng" in reply
    assert "3 lựa chọn tốt nhất" in reply
    assert "ngành Computer Science" in reply
    assert "khoa Software Engineering" in reply
    assert "trường FPT University" in reply
    assert "GPA 3.2" in reply
    assert "xem thêm học bổng" not in reply


def test_extract_query_profile_supports_described_person():
    profile = _extract_query_profile("Tìm học bổng cho người có GPA 3.6, trường FPT University, ngành AI")

    assert profile["gpa"] == 3.6
    assert profile["university"] == "FPT University"
    assert profile["major"] == "AI"


def test_extract_scholarship_search_criteria_supports_general_filters():
    criteria = _extract_scholarship_search_criteria(
        "Tìm cho tôi 3 học bổng mới nhất ngành IT yêu cầu đơn giản GPA thấp trường HCMUS"
    )

    assert criteria["sort"] == "latest"
    assert criteria["major"] == "IT"
    assert criteria["university"] == "HCMUS"
    assert criteria["requirement_complexity"] == "simple"
    assert criteria["gpa_preference"] == "low"
