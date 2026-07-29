"""
Reproducible eval for the FULL production scholarship-ranking pipeline, complementing
eval_scholarship_matching.py.

Why this script exists (gap found while reviewing eval_scholarship_matching.py): that script
calls `_score_profile_match` directly and ranks by that score alone. But the score is NOT what
determines the final order shown to users. The real function used for recommendations,
`_rank_recommendation_items` (app/domains/finance/agents/finance/scholarships/tools/matching.py),
does two things `_score_profile_match` alone does not:

  1. A HARD GATE: a scholarship is only kept if it matches *both* the profile's university and
     major (exact string match after normalization, or a "all" wildcard on either field). One
     matching, one not -> excluded entirely, regardless of text-similarity score.
  2. A SORT KEY for survivors: `_compare_ranked_entries` orders by a weighted `rank_score`
     (0.6 * match_score + 0.25 * GPA-closeness + 0.15 * normalized amount), falling back to
     (3) is_open, (4) recurrence strategy on ties. `match_score` is the same Jaccard/Bigram/
     SequenceMatcher-derived score shown on the UI's "match_score" percentage badge -- it is now
     also the dominant ranking signal, not just a display-only figure.

So `eval_scholarship_matching.py` measures the quality of a sub-component (the text-similarity
formula) in isolation, not what the product actually returns. This script calls
`_rank_recommendation_items` itself -- still no network/DB/LLM, still a pure deterministic
function -- to measure the real end-to-end ranking behavior.

Ground truth: `relevant_scholarship_ids` in the shared dataset
(tests/eval/data/scholarship_matching_eval_set.json) is defined structurally (a scholarship is
relevant if its target_majors covers the profile's major, or is wildcarded) -- independent of the
matching formula, so it's a valid yardstick for both this script and eval_scholarship_matching.py.

This script additionally reports, per profile, how many of the ground-truth-relevant scholarships
survive the hard university+major gate ("gate_eligible_relevant") -- since a topically relevant
scholarship for a different university is *correctly* excluded by design, that's not a ranking
failure. Precision/Recall/F1@K and MRR are computed against gate_eligible_relevant (what the
pipeline could possibly return), with gate_eligible_relevant coverage reported separately as a
diagnostic on how many genuinely relevant results the hard gate discards.

Usage:
    python tests/eval/eval_scholarship_ranking_pipeline.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.domains.finance.agents.finance.scholarships.tools.matching import (
    _major_match,
    _rank_recommendation_items,
    _university_match,
)

DATASET_PATH = Path(__file__).parent / "data" / "scholarship_matching_eval_set.json"
REPORT_DIR = Path(__file__).parent / "reports"
K_VALUES = (1, 3, 5)

# Fixed reference "now" so is_active/deadline-derived fields (is_open, recommendation_strategy)
# are reproducible across runs regardless of when this script is executed.
EVAL_NOW = datetime(2026, 7, 26, tzinfo=timezone.utc)


def _parse_scholarship_row(raw: dict) -> dict:
    row = dict(raw)
    deadline = row.get("application_deadline")
    if isinstance(deadline, str):
        row["application_deadline"] = datetime.fromisoformat(deadline).replace(tzinfo=timezone.utc)
    return row


def gate_eligible(profile: dict, row: dict) -> bool:
    return _university_match(profile, row) and _major_match(profile, row)


def precision_recall_f1_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> tuple[float, float, float]:
    top_k = ranked_ids[:k]
    hits = sum(1 for rid in top_k if rid in relevant_ids)
    precision = hits / k
    recall = hits / len(relevant_ids) if relevant_ids else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return precision, recall, f1


def reciprocal_rank(ranked_ids: list[str], relevant_ids: set[str]) -> float:
    for i, rid in enumerate(ranked_ids, start=1):
        if rid in relevant_ids:
            return 1.0 / i
    return 0.0


def run() -> None:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    profiles = dataset["profiles"]
    scholarship_rows = [_parse_scholarship_row(s) for s in dataset["scholarships"]]
    relevant_ids_map = dataset["relevant_scholarship_ids"]

    per_profile_results = []
    metrics_at_k = {k: {"precision": [], "recall": [], "f1": []} for k in K_VALUES}
    reciprocal_ranks = []
    gate_coverage_ratios = []

    for profile in profiles:
        pid = profile["id"]
        relevant_ids = set(relevant_ids_map.get(pid, []))
        gate_eligible_relevant = {
            sid for sid in relevant_ids
            if gate_eligible(profile, next(r for r in scholarship_rows if r["id"] == sid))
        }
        gate_coverage = (len(gate_eligible_relevant) / len(relevant_ids)) if relevant_ids else 0.0
        gate_coverage_ratios.append(gate_coverage)

        items, total_survivors = _rank_recommendation_items(
            scholarship_rows=scholarship_rows,
            requirement_map={},
            profile=profile,
            safe_limit=len(scholarship_rows),
            now=EVAL_NOW,
        )
        ranked_ids = [item["id"] for item in items]

        rr = reciprocal_rank(ranked_ids, gate_eligible_relevant)
        reciprocal_ranks.append(rr)

        per_k = {}
        for k in K_VALUES:
            p, r, f1 = precision_recall_f1_at_k(ranked_ids, gate_eligible_relevant, k)
            metrics_at_k[k]["precision"].append(p)
            metrics_at_k[k]["recall"].append(r)
            metrics_at_k[k]["f1"].append(f1)
            per_k[k] = {"precision": p, "recall": r, "f1": f1}

        per_profile_results.append({
            "profile_id": pid,
            "profile_label": profile["label"],
            "relevant_ids_topical": sorted(relevant_ids),
            "relevant_ids_gate_eligible": sorted(gate_eligible_relevant),
            "gate_coverage": gate_coverage,
            "total_survivors_after_gate": total_survivors,
            "ranked_ids_after_gate": ranked_ids,
            "reciprocal_rank": rr,
            "metrics_at_k": per_k,
        })

    def avg(xs: list[float]) -> float:
        return sum(xs) / len(xs) if xs else 0.0

    mrr = avg(reciprocal_ranks)
    top1_accuracy = avg([
        1.0 if r["ranked_ids_after_gate"] and r["ranked_ids_after_gate"][0] in set(r["relevant_ids_gate_eligible"]) else 0.0
        for r in per_profile_results
    ])
    avg_gate_coverage = avg(gate_coverage_ratios)

    print("=== Kết quả đánh giá PIPELINE ĐẦY ĐỦ (gate trường+ngành + sắp xếp GPA/amount) ===")
    print("Hàm dưới test: _rank_recommendation_items (đúng hàm production dùng để trả kết quả gợi ý)")
    print(f"Số hồ sơ: {len(profiles)}, số học bổng: {len(scholarship_rows)}")
    print(f"\nĐộ phủ gate trung bình (bao nhiêu %% học bổng 'liên quan chủ đề' còn sống sót sau gate "
          f"trường+ngành): {avg_gate_coverage * 100:.1f}%")
    print(f"Top-1 accuracy (trong số học bổng qua được gate): {top1_accuracy * 100:.1f}%")
    print(f"MRR: {mrr:.3f}")
    print(f"\n{'K':<6}{'Precision@K':<14}{'Recall@K':<12}{'F1@K':<10}")
    for k in K_VALUES:
        p = avg(metrics_at_k[k]["precision"])
        r = avg(metrics_at_k[k]["recall"])
        f1 = avg(metrics_at_k[k]["f1"])
        print(f"{k:<6}{p * 100:<13.1f}%{r * 100:<11.1f}%{f1 * 100:<9.1f}%")

    print("\nChi tiết theo từng hồ sơ (Top-3 sau gate):")
    for r in per_profile_results:
        top3 = r["ranked_ids_after_gate"][:3]
        eligible = set(r["relevant_ids_gate_eligible"])
        marks = "".join("✓" if sid in eligible else "✗" for sid in top3) or "(rỗng - không có học bổng nào qua gate)"
        print(f"  [{r['profile_label']:<20}] gate_coverage={r['gate_coverage']*100:.0f}%  "
              f"RR={r['reciprocal_rank']:.2f}  top-3={marks}  survivors={r['total_survivors_after_gate']}")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "eval_now_reference": EVAL_NOW.isoformat(),
        "function_under_test": "_rank_recommendation_items [production ranking function, includes hard "
                                "university+major gate + GPA-gap/amount/openness sort -- NOT the raw "
                                "fuzzy score, see eval_scholarship_matching.py for that sub-component]",
        "methodology_note": (
            "Precision/Recall/F1@K and MRR are computed against gate_eligible_relevant (topically "
            "relevant scholarships that also pass the hard university+major gate) -- a topically "
            "relevant scholarship for a different university is correctly excluded by design, not a "
            "ranking failure. avg_gate_coverage reports what fraction of topically-relevant "
            "scholarships the hard gate discards, as a separate diagnostic."
        ),
        "num_profiles": len(profiles),
        "num_scholarships": len(scholarship_rows),
        "avg_gate_coverage": avg_gate_coverage,
        "top1_accuracy": top1_accuracy,
        "mrr": mrr,
        "metrics_at_k": {
            k: {
                "precision": avg(metrics_at_k[k]["precision"]),
                "recall": avg(metrics_at_k[k]["recall"]),
                "f1": avg(metrics_at_k[k]["f1"]),
            }
            for k in K_VALUES
        },
        "per_profile": per_profile_results,
    }
    out_path = REPORT_DIR / f"scholarship_ranking_pipeline_eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nBáo cáo chi tiết đã lưu: {out_path}")


if __name__ == "__main__":
    run()
