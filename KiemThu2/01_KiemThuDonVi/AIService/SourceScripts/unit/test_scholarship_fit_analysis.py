from datetime import datetime, timedelta, timezone

from app.domains.finance.models.scholarship_fit import ScholarshipFitAction, ScholarshipFitReason
from app.domains.finance.scholarships.fit_analysis import (
    _build_profile_snapshot,
    _build_scholarship_snapshot,
    _evaluate_rules,
    _level_for_score,
)
from app.domains.finance.scholarships.competition import resolve_scholarship_competition


def _sources(**overrides):
    now = datetime.now(timezone.utc)
    base = {
        "scholarship": {
            "id": "00000000-0000-0000-0000-000000000001",
            "name": "Merit Scholarship",
            "description": "For Software Engineering students.",
            "eligibility_criteria": "GPA and IELTS are considered.",
            "benefits": "Tuition support",
            "provider": "Student360",
            "target_majors": ["Software Engineering"],
            "target_universities": ["FPT University"],
            "minimum_gpa": 3.2,
            "minimum_gpa_scale": 4,
            "level": "Undergraduate",
            "is_active": True,
            "application_deadline": now + timedelta(days=30),
            "category_name": "Merit",
        },
        "requirements": [
            {
                "title": "English certificate",
                "description": "IELTS or TOEIC certificate is preferred",
                "is_required": True,
                "sort_order": 1,
            }
        ],
        "documents": [{"document_name": "Transcript", "is_required": True}],
        "user": {"country": "Vietnam", "career_goal": "Software Engineer"},
        "academics": [
            {
                "major": "Software Engineering",
                "faculty": "Information Technology",
                "university": "FPT University",
                "degree_level": "Undergraduate",
                "gpa": 3.6,
                "current_year": 3,
                "current_semester": 6,
            }
        ],
        "certificates": [
            {
                "certificate_name": "IELTS Academic",
                "certificate_type": "language",
                "final_score": "7.0",
                "status": "active",
            }
        ],
        "skills": [],
        "interests": [],
    }
    base.update(overrides)
    return base


def _run(sources):
    reasons: list[ScholarshipFitReason] = []
    actions: list[ScholarshipFitAction] = []
    hard_blockers: list[ScholarshipFitReason] = []
    profile = _build_profile_snapshot(sources)
    scholarship = _build_scholarship_snapshot(sources)
    score, cap = _evaluate_rules(
        sources=sources,
        profile_snapshot=profile,
        scholarship_snapshot=scholarship,
        reasons=reasons,
        actions=actions,
        hard_blockers=hard_blockers,
        now=datetime.now(timezone.utc),
    )
    final = 0 if hard_blockers else max(0, min(round(score), cap))
    return final, _level_for_score(final), reasons, actions, hard_blockers


def test_competition_ratio_low():
    competition = resolve_scholarship_competition(100, 50)

    assert competition.applicants_per_slot == 2
    assert competition.competition_level == "low"
    assert competition.competition_basis == "applicants_per_slot"


def test_competition_ratio_medium():
    competition = resolve_scholarship_competition(800, 50)

    assert competition.applicants_per_slot == 16
    assert competition.competition_level == "medium"
    assert competition.competition_basis == "applicants_per_slot"


def test_competition_ratio_high():
    competition = resolve_scholarship_competition(1200, 25)

    assert competition.applicants_per_slot == 48
    assert competition.competition_level == "high"
    assert competition.competition_basis == "applicants_per_slot"


def test_competition_falls_back_to_applicants_count_without_quantity():
    competition = resolve_scholarship_competition(800, None)

    assert competition.applicants_per_slot is None
    assert competition.competition_level == "medium"
    assert competition.competition_basis == "applicants_count"


def test_competition_unknown_without_applicants_count():
    competition = resolve_scholarship_competition(None, 50)

    assert competition.applicants_per_slot is None
    assert competition.competition_level == "unknown"
    assert competition.competition_basis == "unknown"


def test_competition_zero_quantity_does_not_divide():
    competition = resolve_scholarship_competition(100, 0)

    assert competition.applicants_per_slot is None
    assert competition.competition_level == "low"
    assert competition.competition_basis == "applicants_count"


def test_competition_zero_applicants_with_quantity_is_low_ratio():
    competition = resolve_scholarship_competition(0, 50)

    assert competition.applicants_per_slot == 0
    assert competition.competition_level == "low"
    assert competition.competition_basis == "applicants_per_slot"


def test_active_match_gpa_meets_is_high():
    score, level, reasons, _actions, blockers = _run(_sources())

    assert not blockers
    assert level == "high"
    assert score >= 75
    assert any(reason.code == "gpa_meets_requirement" for reason in reasons)
    assert not any(reason.code == "scholarship_open" for reason in reasons)


def test_gpa_below_requirement_is_improvable_not_impossible():
    sources = _sources(
        academics=[
            {
                "major": "Software Engineering",
                "faculty": "Information Technology",
                "university": "FPT University",
                "gpa": 3.0,
            }
        ]
    )
    _score, _level, reasons, actions, blockers = _run(sources)

    assert not blockers
    assert any(reason.code == "gpa_below_requirement" and reason.severity == "improvable" for reason in reasons)
    assert any(
        action.code == "improve_gpa" and "cạnh tranh" in action.message
        for action in actions
    )


def test_inactive_scholarship_is_impossible():
    score, _level, reasons, _actions, blockers = _run(
        _sources(scholarship={**_sources()["scholarship"], "is_active": False})
    )

    assert score == 0
    assert blockers
    assert any(reason.code == "scholarship_inactive" for reason in reasons)


def test_inactive_recurring_scholarship_is_prepare_ahead_not_impossible():
    score, _level, reasons, actions, blockers = _run(
        _sources(
            scholarship={
                **_sources()["scholarship"],
                "is_active": False,
                "recurrence_type": "recurring",
                "expected_next_open_date": datetime.now(timezone.utc) + timedelta(days=90),
            }
        )
    )

    assert score > 0
    assert not blockers
    assert any(reason.code == "prepare_ahead_recurring" for reason in reasons)
    assert any(action.code == "prepare_ahead" for action in actions)


def test_high_competition_adds_warning():
    _score, _level, reasons, _actions, blockers = _run(
        _sources(
            scholarship={
                **_sources()["scholarship"],
                "applicants_count": 1200,
                "competition_level": "high",
            }
        )
    )

    assert not blockers
    assert any(reason.code == "competition_high" for reason in reasons)


def test_competition_level_uses_ratio_before_applicants_count():
    sources = _sources(
        scholarship={
            **_sources()["scholarship"],
            "applicants_count": 800,
            "quantity": 25,
        }
    )
    snapshot = _build_scholarship_snapshot(sources)
    _score, _level, reasons, _actions, blockers = _run(sources)

    assert snapshot["applicantsPerSlot"] == 32
    assert snapshot["competitionBasis"] == "applicants_per_slot"
    assert snapshot["competitionLevel"] == "high"
    assert not blockers
    competition_reason = next(reason for reason in reasons if reason.code == "competition_high")
    assert "applicantsPerSlot=32" in (competition_reason.evidence or "")


def test_competition_fallback_wording_when_quantity_missing():
    _score, _level, reasons, _actions, blockers = _run(
        _sources(
            scholarship={
                **_sources()["scholarship"],
                "applicants_count": 800,
                "quantity": None,
            }
        )
    )

    assert not blockers
    competition_reason = next(reason for reason in reasons if reason.code == "competition_medium")
    assert "competitionBasis=applicants_count" in (competition_reason.evidence or "")


def test_missing_language_certificate_is_improvable():
    _score, _level, reasons, actions, blockers = _run(_sources(certificates=[]))

    assert not blockers
    assert any(reason.code == "missing_language_certificate" for reason in reasons)
    assert any(action.code == "add_language_certificate" for action in actions)


def test_required_documents_action_lists_document_names():
    _score, _level, _reasons, actions, blockers = _run(
        _sources(
            documents=[
                {"document_name": "Bảng điểm", "is_required": True},
                {"document_name": "Giấy xác nhận điểm rèn luyện", "is_required": True},
            ]
        )
    )

    assert not blockers
    document_action = next(action for action in actions if action.code == "prepare_required_documents")
    assert "Bảng điểm" in document_action.message
    assert "Giấy xác nhận điểm rèn luyện" in document_action.message


def test_hardship_action_is_conditional_not_definitive():
    _score, _level, reasons, actions, blockers = _run(
        _sources(
            scholarship={
                **_sources()["scholarship"],
                "eligibility_criteria": "Need based scholarship for financial hardship students; GPA >= 3.2",
            }
        )
    )

    assert not blockers
    assert any(reason.code == "hardship_evidence_missing" for reason in reasons)
    hardship_action = next(action for action in actions if action.code == "prepare_hardship_evidence")
    assert "Nếu bạn thuộc diện phù hợp" in hardship_action.message


def test_wildcard_targets_are_not_a_mismatch_blocker():
    sources = _sources(
        scholarship={
            **_sources()["scholarship"],
            "target_majors": ["all"],
            "target_universities": ["all"],
        },
        academics=[
            {
                "major": "Materials Science and Engineering",
                "faculty": "Materials Science",
                "university": "University of Science, VNU-HCM",
                "gpa": 3.6,
            }
        ],
    )
    snapshot = _build_scholarship_snapshot(sources)
    _score, level, reasons, _actions, blockers = _run(sources)

    assert snapshot["targetMajors"] == []
    assert snapshot["targetUniversities"] == []
    assert not blockers
    assert level != "impossible"
    assert not any(
        reason.code in {"major_mismatch", "university_mismatch"} for reason in reasons
    )


def test_vietnamese_wildcard_targets_are_open_to_all():
    sources = _sources(
        scholarship={
            **_sources()["scholarship"],
            "target_majors": ["Tất cả các ngành"],
            "target_universities": ["Mọi trường"],
        },
    )
    snapshot = _build_scholarship_snapshot(sources)
    _score, _level, reasons, _actions, blockers = _run(sources)

    assert snapshot["targetMajors"] == []
    assert snapshot["targetUniversities"] == []
    assert not blockers
    assert not any(
        reason.code in {"major_mismatch", "university_mismatch"} for reason in reasons
    )


def test_strict_major_mismatch_uses_only_reasonable_actions():
    sources = _sources(
        scholarship={
            **_sources()["scholarship"],
            "description": "Only for Marketing students.",
            "target_majors": ["Marketing"],
        },
        academics=[
            {
                "major": "Software Engineering",
                "faculty": "Information Technology",
                "university": "FPT University",
                "gpa": 2.8,
            }
        ],
    )
    _score, _level, reasons, actions, blockers = _run(sources)

    assert blockers
    assert any(reason.code == "major_mismatch" for reason in reasons)
    assert not any(action.code in {"improve_gpa", "prepare_required_documents"} for action in actions)
    assert any(action.code == "find_better_fit_scholarship" for action in actions)
