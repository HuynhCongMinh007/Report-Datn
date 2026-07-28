from __future__ import annotations

from app.domains.finance.agents.finance.react_loop import _parse_action_response


def test_parse_action_response_keeps_valid_tag_slug():
    text = """
    Ok.
    <ACTIONS>
    {"actions": [{"type": "CREATE_TRANSACTION", "title": "Chi ăn trưa", "description": "", "params": {"type": "EXPENSE", "amount": 60000, "description": "Ăn trưa", "jarCode": "essentials", "tagSlug": "an-uong", "transactionDate": "2026-05-26"}, "risk_level": "low"}]}
    </ACTIONS>
    """
    tags_by_jar = {"essentials": [{"slug": "an-uong", "name": "Ăn uống"}, {"slug": "khac", "name": "Khác"}]}

    _, actions = _parse_action_response(text, tags_by_jar)

    assert len(actions) == 1
    assert actions[0].params["tagSlug"] == "an-uong"


def test_parse_action_response_falls_back_to_khac_for_invalid_tag_slug():
    text = """
    <ACTIONS>
    {"actions": [{"type": "CREATE_TRANSACTION", "title": "Chi lặt vặt", "description": "", "params": {"type": "EXPENSE", "amount": 45000, "description": "Chi lặt vặt", "jar_code": "essentials", "tag_slug": "khong-ton-tai", "transaction_date": "2026-05-26"}, "risk_level": "low"}]}
    </ACTIONS>
    """
    tags_by_jar = {"essentials": [{"slug": "an-uong", "name": "Ăn uống"}, {"slug": "khac", "name": "Khác"}]}

    _, actions = _parse_action_response(text, tags_by_jar)

    assert len(actions) == 1
    assert actions[0].params["jarCode"] == "essentials"
    assert actions[0].params["transactionDate"] == "2026-05-26"
    assert actions[0].params["tagSlug"] == "khac"


def test_parse_action_response_adds_khac_when_missing_tag_slug():
    text = """
    <ACTIONS>
    {"actions": [{"type": "CREATE_TRANSACTION", "title": "Chi cà phê", "description": "", "params": {"type": "EXPENSE", "amount": 45000, "description": "Cà phê", "jarCode": "enjoyment", "transactionDate": "2026-05-26"}, "risk_level": "low"}]}
    </ACTIONS>
    """
    tags_by_jar = {"enjoyment": [{"slug": "khac", "name": "Khác"}, {"slug": "giai-tri", "name": "Giải trí"}]}

    _, actions = _parse_action_response(text, tags_by_jar)

    assert len(actions) == 1
    assert actions[0].params["tagSlug"] == "khac"
