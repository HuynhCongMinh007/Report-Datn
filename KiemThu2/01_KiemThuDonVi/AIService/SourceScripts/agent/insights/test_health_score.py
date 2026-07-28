from __future__ import annotations

import pytest
from app.api.finance.insights import _build_structured_analysis, InsightsRequest

@pytest.fixture
def base_request() -> InsightsRequest:
    return InsightsRequest(user_id="f80eaa47-c546-4874-937c-6af2a27791ab", month=5, year=2026)


def test_health_score_perfect_conditions(base_request):
    # Under budget, income > expenses, no anomalies
    jar_rows = [
        {"jar_code": "essentials", "jar_name": "Thiết yếu", "total_income": 10000000, "total_expense": 5000000, "previous_expense": 5000000, "budget_amount": 8000000, "tx_count": 5}
    ]
    tx_rows = []
    tag_rows = []
    
    res = _build_structured_analysis(base_request, jar_rows, tx_rows, tag_rows)
    
    assert "health_score" in res
    score_data = res["health_score"]
    assert score_data["score"] == 100
    assert score_data["level"] == "Tốt"


def test_health_score_overspent(base_request):
    # Expenses > Income and budget exceeded
    jar_rows = [
        {"jar_code": "essentials", "jar_name": "Thiết yếu", "total_income": 5000000, "total_expense": 9000000, "previous_expense": 5000000, "budget_amount": 8000000, "tx_count": 5}
    ]
    tx_rows = []
    tag_rows = []

    res = _build_structured_analysis(base_request, jar_rows, tx_rows, tag_rows)

    score_data = res["health_score"]
    # Score should drop significantly
    assert score_data["score"] < 70
    assert score_data["level"] in {"Cần chú ý", "Rủi ro"}


# WalletHealth-TC006: một anomaly severity=danger phải trừ đúng 20 điểm, ngay cả
# khi expense_ratio tổng thể vẫn bình thường (<=0.75) — cô lập nhánh trừ điểm do
# danger (dòng "if any(a['severity'] == 'danger' ...): score -= 20") khỏi nhánh
# trừ điểm theo expense_ratio.
def test_health_score_danger_anomaly_deducts_20_points_independent_of_ratio(base_request):
    jar_rows = [
        {
            "jar_code": "enjoyment",
            "jar_name": "Hưởng thụ",
            "total_income": 10000000,
            "total_expense": 2000000,
            "previous_expense": 2000000,
            # budget_used = 2,000,000 / 1,000,000 = 200% >= 100% -> danger anomaly,
            # while overall expense_ratio (2,000,000 / 10,000,000 = 0.2) stays healthy.
            "budget_amount": 1000000,
            "tx_count": 3,
        }
    ]

    res = _build_structured_analysis(base_request, jar_rows, [], [])

    assert any(a["severity"] == "danger" for a in res["anomalies"])
    score_data = res["health_score"]
    # 100 (no ratio penalty) - 20 (danger anomaly) = 80
    assert score_data["score"] == 80


# WalletHealth-TC007: nhiều anomaly severity=warning (mỗi cái đáng lẽ trừ 5
# điểm) chỉ được trừ tối đa 20 điểm cho cả nhóm — không được trừ vượt cap.
def test_health_score_caps_warning_deduction_at_20_points(base_request):
    # 6 lọ, mỗi lọ tăng chi >=20% so với tháng trước (budget_used < 80% để không
    # bị phân loại là danger) -> mỗi lọ tạo 1 anomaly "jar_spike" severity=warning.
    # 6 * 5 = 30 điểm đáng lẽ bị trừ, nhưng phải bị chặn ở mức tối đa 20.
    jar_rows = [
        {
            "jar_code": f"jar-{i}",
            "jar_name": f"Lọ {i}",
            "total_income": 2000000,
            "total_expense": 200000,
            "previous_expense": 100000,  # change = +100% >= 20% -> warning
            "budget_amount": 1000000,  # budget_used = 20% < 80%, not danger
            "tx_count": 2,
        }
        for i in range(6)
    ]

    res = _build_structured_analysis(base_request, jar_rows, [], [])

    warning_anomalies = [a for a in res["anomalies"] if a["severity"] == "warning"]
    assert len(warning_anomalies) >= 5  # confirms the cap is actually being exercised
    score_data = res["health_score"]
    # 100 - min(20, 6*5) = 80, NOT 100 - 30 = 70
    assert score_data["score"] == 80
