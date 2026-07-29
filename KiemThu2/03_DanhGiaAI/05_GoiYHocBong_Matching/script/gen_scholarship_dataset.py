"""
Generator for the expanded scholarship-matching eval dataset (30 profiles x 36 scholarships).

Design goals (see conversation notes / README to be written alongside this):
- Controlled vocabulary (10 universities x 10 majors) so exact-string gate fields
  (target_universities / target_majors) can be authored without typos.
- Ground truth "relevant_scholarship_ids" is defined structurally (a scholarship is relevant to
  a profile if its target_majors covers the profile's major, or is wildcarded to "all") rather than
  by the fuzzy Jaccard/Bigram/SequenceMatcher formula under test -- avoids a circular ground truth.
- Deliberate mix of scholarship targeting breadth so the hard university+major gate in
  `_rank_recommendation_items` (app/domains/finance/agents/finance/scholarships/tools/matching.py)
  has a mix of pass/fail cases to exercise, not just wildcard-everything.
- Deterministic (seeded) so re-running this generator reproduces the exact same file.
"""
import json
import random
from pathlib import Path

random.seed(42)

UNIS = [
    "Đại học FPT",
    "Đại học Bách Khoa Hà Nội",
    "Đại học Quốc gia Thành phố Hồ Chí Minh",
    "Đại học Kinh tế Quốc dân",
    "Đại học Ngoại thương",
    "Đại học Sư phạm Hà Nội",
    "Đại học Khoa học Tự nhiên Thành phố Hồ Chí Minh",
    "Đại học Công nghệ Thông tin",
    "Đại học Y Hà Nội",
    "Đại học Cần Thơ",
]

MAJORS = [
    "Công nghệ thông tin",
    "Khoa học máy tính",
    "Kinh tế",
    "Tài chính - Ngân hàng",
    "Kế toán",
    "Sư phạm Toán",
    "Y đa khoa",
    "Ngôn ngữ Anh",
    "Quản trị kinh doanh",
    "Kỹ thuật điện",
]

# (skills, interests) per major -- used to build realistic profile.skills/interests
MAJOR_PROFILE_TRAITS = {
    "Công nghệ thông tin": (["python", "java", "sql"], ["lập trình", "phần mềm", "công nghệ"]),
    "Khoa học máy tính": (["python", "machine learning", "AI"], ["trí tuệ nhân tạo", "nghiên cứu", "thuật toán"]),
    "Kinh tế": (["phân tích dữ liệu", "excel", "kinh tế lượng"], ["kinh tế vĩ mô", "đầu tư", "thị trường"]),
    "Tài chính - Ngân hàng": (["phân tích tài chính", "excel", "định giá doanh nghiệp"], ["ngân hàng", "chứng khoán", "đầu tư"]),
    "Kế toán": (["kế toán tài chính", "excel", "kiểm toán"], ["thuế", "báo cáo tài chính", "kiểm soát nội bộ"]),
    "Sư phạm Toán": (["giảng dạy", "toán học", "soạn giáo án"], ["giáo dục", "toán học", "sư phạm"]),
    "Y đa khoa": (["giải phẫu", "lâm sàng", "chăm sóc bệnh nhân"], ["y khoa", "sức khỏe cộng đồng", "nghiên cứu y học"]),
    "Ngôn ngữ Anh": (["biên phiên dịch", "IELTS", "giảng dạy tiếng Anh"], ["ngôn ngữ", "văn hóa", "giao tiếp quốc tế"]),
    "Quản trị kinh doanh": (["quản lý dự án", "marketing", "lãnh đạo nhóm"], ["khởi nghiệp", "marketing", "quản trị"]),
    "Kỹ thuật điện": (["mạch điện", "PLC", "autocad"], ["tự động hóa", "kỹ thuật", "năng lượng"]),
}

# scholarship "flavor" text per major, used in name/description/eligibility_criteria/category_name
MAJOR_SCHOLARSHIP_TRAITS = {
    "Công nghệ thông tin": ("Công nghệ", "sinh viên ngành công nghệ thông tin có đam mê lập trình, phát triển phần mềm"),
    "Khoa học máy tính": ("Công nghệ", "sinh viên khoa học máy tính, trí tuệ nhân tạo, machine learning"),
    "Kinh tế": ("Kinh tế", "sinh viên ngành kinh tế có tư duy phân tích thị trường, kinh tế vĩ mô"),
    "Tài chính - Ngân hàng": ("Tài chính", "sinh viên tài chính - ngân hàng, quan tâm đầu tư và chứng khoán"),
    "Kế toán": ("Tài chính", "sinh viên kế toán, kiểm toán, có kỹ năng báo cáo tài chính"),
    "Sư phạm Toán": ("Giáo dục", "sinh viên sư phạm toán, định hướng giảng dạy và nghiên cứu giáo dục"),
    "Y đa khoa": ("Y tế", "sinh viên y đa khoa, quan tâm lâm sàng và sức khỏe cộng đồng"),
    "Ngôn ngữ Anh": ("Ngôn ngữ", "sinh viên ngôn ngữ Anh, biên phiên dịch, giảng dạy tiếng Anh"),
    "Quản trị kinh doanh": ("Kinh doanh", "sinh viên quản trị kinh doanh, khởi nghiệp và marketing"),
    "Kỹ thuật điện": ("Kỹ thuật", "sinh viên kỹ thuật điện, tự động hóa, năng lượng"),
}

PROVIDERS = [
    "Tập đoàn Công nghệ ABC", "Quỹ Giáo dục Việt Nam", "Ngân hàng Thịnh Vượng",
    "Hiệp hội Doanh nghiệp Trẻ", "Bộ Giáo dục và Đào tạo", "Quỹ Phát triển Nhân tài",
    "Tổ chức Giáo dục Quốc tế", "Công ty Năng lượng Xanh", "Hội Cựu sinh viên",
    "Quỹ Học bổng Cộng đồng",
]

DATASET_PATH = Path("/Users/nguyenvh/School/Student360/student360-ai/tests/eval/data/scholarship_matching_eval_set.json")


def gen_profiles():
    profiles = []
    idx = 1
    # 15 profiles per major (10 majors x 15 = 150), cycling universities so each major sees
    # a spread of universities, and varying GPA.
    gpa_cycle = [2.6, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9]
    for mi, major in enumerate(MAJORS):
        skills, interests = MAJOR_PROFILE_TRAITS[major]
        for k in range(15):
            uni = UNIS[(mi + k * 3) % len(UNIS)]
            gpa = gpa_cycle[(mi * 3 + k) % len(gpa_cycle)]
            pid = f"p{idx:03d}"
            profiles.append({
                "id": pid,
                "label": f"{major[:18]}/{uni.split()[-1]}",
                "major": major,
                "university": uni,
                "gpa": gpa,
                "skills": skills,
                "interests": interests,
            })
            idx += 1
    return profiles


def gen_scholarships():
    scholarships = []
    idx = 1
    rng = random.Random(7)

    # (a) 20 national/general scholarships: open to all universities AND all majors
    general_names = [
        "Học bổng Vươn Cao Toàn Quốc", "Học bổng Khuyến Học Vì Cộng Đồng",
        "Học bổng Nghị Lực Sinh Viên", "Học bổng Đồng Hành Tri Thức",
        "Học bổng Ước Mơ Việt", "Học bổng Tài Năng Trẻ Toàn Quốc",
        "Học bổng Thắp Sáng Tương Lai", "Học bổng Hạt Giống Tri Thức",
        "Học bổng Phát Triển Nhân Tài", "Học bổng Chắp Cánh Ước Mơ",
        "Học bổng Ngôi Sao Tri Thức", "Học bổng Tương Lai Xanh",
        "Học bổng Nâng Tầm Tri Thức", "Học bổng Hành Trình Vươn Xa",
        "Học bổng Tuổi Trẻ Sáng Tạo", "Học bổng Vươn Tới Đỉnh Cao",
        "Học bổng Khơi Nguồn Tri Thức", "Học bổng Tiếp Sức Sinh Viên",
        "Học bổng Khát Vọng Việt", "Học bổng Đội Ngũ Tương Lai",
    ]
    for name in general_names:
        scholarships.append({
            "id": f"s{idx:03d}",
            "name": name,
            "description": f"Dành cho mọi sinh viên có thành tích học tập tốt, không giới hạn ngành hay trường, "
                            f"ưu tiên hoàn cảnh khó khăn vươn lên trong học tập.",
            "eligibility_criteria": "Sinh viên mọi ngành, mọi trường, GPA đạt yêu cầu tối thiểu",
            "benefits": f"{rng.choice([5, 8, 10, 12])} triệu đồng",
            "provider": rng.choice(PROVIDERS),
            "category_name": "Tổng hợp",
            "target_universities": ["all"],
            "target_majors": ["all"],
            "minimum_gpa": rng.choice([2.5, 2.8, 3.0]),
            "minimum_gpa_scale": 4,
            "amount": rng.choice([5000000, 8000000, 10000000, 12000000]),
            "application_deadline": "2026-12-31T23:59:59",
            "is_active": True,
            "applicants_count": rng.randint(50, 400),
            "quantity": rng.randint(20, 100),
        })
        idx += 1

    # (b) 25 field-specific scholarships per major (10 majors x 25 = 250), open to ALL universities
    variant_labels = [
        "Xuất Sắc", "Phát Triển", "Tiềm Năng", "Đồng Hành", "Vươn Xa",
        "Sáng Tạo", "Nghiên Cứu", "Tài Năng", "Khuyến Khích", "Đổi Mới",
        "Tiên Phong", "Hội Nhập", "Chuyên Sâu", "Ứng Dụng", "Bứt Phá",
        "Ưu Tú", "Vượt Khó", "Vươn Lên", "Cống Hiến", "Tiên Tiến",
        "Chuyên Cần", "Năng Động", "Trí Tuệ", "Vươn Tầm", "Kiến Tạo",
    ]
    for major in MAJORS:
        category, flavor = MAJOR_SCHOLARSHIP_TRAITS[major]
        for variant in range(25):
            deadline_open = variant % 2 == 0  # xen kẽ mở/đóng hạn cho đa dạng
            scholarships.append({
                "id": f"s{idx:03d}",
                "name": f"Học bổng {category} {variant_labels[variant]} — {major}",
                "description": f"Dành cho {flavor}.",
                "eligibility_criteria": f"Sinh viên ngành {major}, có thành tích học tập tốt",
                "benefits": f"{rng.choice([8, 10, 15, 20])} triệu đồng",
                "provider": rng.choice(PROVIDERS),
                "category_name": category,
                "target_universities": ["all"],
                "target_majors": [major],
                "minimum_gpa": rng.choice([2.8, 3.0, 3.2, 3.5]),
                "minimum_gpa_scale": 4,
                "amount": rng.choice([8000000, 10000000, 15000000, 20000000]),
                "application_deadline": "2026-12-15T23:59:59" if deadline_open else "2026-03-01T23:59:59",
                "is_active": deadline_open,
                "applicants_count": rng.randint(20, 200),
                "quantity": rng.randint(10, 60),
            })
            idx += 1

    # (c) 3 university-wide merit scholarships per university (10 unis x 3 = 30)
    uni_variants = ["Khuyến Khích", "Tài Năng", "Xuất Sắc"]
    for uni in UNIS:
        for uvar in uni_variants:
            scholarships.append({
                "id": f"s{idx:03d}",
                "name": f"Học bổng {uvar} {uni}",
                "description": f"Dành cho sinh viên xuất sắc đang theo học tại {uni}, không phân biệt ngành.",
                "eligibility_criteria": f"Đang là sinh viên chính quy tại {uni}, GPA đạt yêu cầu tối thiểu",
                "benefits": "Miễn giảm học phí một kỳ",
                "provider": uni,
                "category_name": "Học bổng trường",
                "target_universities": [uni],
                "target_majors": ["all"],
                "minimum_gpa": rng.choice([3.0, 3.2, 3.4]),
                "minimum_gpa_scale": 4,
                "amount": rng.choice([6000000, 9000000, 12000000]),
                "application_deadline": "2026-11-30T23:59:59",
                "is_active": True,
                "applicants_count": rng.randint(30, 150),
                "quantity": rng.randint(15, 50),
            })
            idx += 1

    return scholarships


def gen_relevant_ids(profiles, scholarships):
    """Structural relevance: a scholarship is relevant to a profile if it is SPECIFICALLY
    targeted at the profile's major (target_majors is that exact major, not a wildcard).

    Deliberately excludes "all"-major scholarships from the ground truth, even though they are
    gate-eligible for every profile: they're legitimate fallback candidates but not what a
    quality recommender should be measuring itself against, and counting them as "relevant" for
    every profile would make Precision@K trivially ~100% (every profile's gate-eligible set would
    be dominated by universally-relevant items, see the first (flawed) version of this generator,
    which produced exactly that vacuous 100% result). Excluding them means Precision@K now
    genuinely measures whether the production sort (GPA-gap / amount / openness) surfaces the
    few *specifically*-targeted scholarships above the generic ones that also survive the gate."""
    relevant = {}
    for p in profiles:
        ids = [s["id"] for s in scholarships if p["major"] in s["target_majors"]]
        relevant[p["id"]] = ids
    return relevant


def main():
    profiles = gen_profiles()
    scholarships = gen_scholarships()
    relevant = gen_relevant_ids(profiles, scholarships)

    dataset = {
        "_meta": {
            "description": (
                "Expanded scholarship-matching eval dataset (150 profiles x 300 scholarships, "
                "10 universities x 10 majors controlled vocabulary). Generated by "
                "gen_scholarship_dataset.py (seeded, reproducible). Ground truth "
                "relevant_scholarship_ids is defined structurally from target_majors coverage, "
                "not from the fuzzy-matching formula under test."
            ),
            "num_profiles": len(profiles),
            "num_scholarships": len(scholarships),
            "universities": UNIS,
            "majors": MAJORS,
        },
        "profiles": profiles,
        "scholarships": scholarships,
        "relevant_scholarship_ids": relevant,
    }

    DATASET_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(profiles)} profiles, {len(scholarships)} scholarships -> {DATASET_PATH}")

    # sanity check: every profile has >=1 relevant scholarship, and at least 1 of those
    # also passes the hard university+major gate (i.e. the full-pipeline eval is meaningful,
    # not vacuously 0 for everyone).
    sch_by_id = {s["id"]: s for s in scholarships}
    zero_relevant = [p["id"] for p in profiles if not relevant[p["id"]]]
    zero_gate_eligible = []
    for p in profiles:
        gate_ok = False
        for sid in relevant[p["id"]]:
            s = sch_by_id[sid]
            uni_ok = "all" in s["target_universities"] or p["university"] in s["target_universities"]
            major_ok = "all" in s["target_majors"] or p["major"] in s["target_majors"]
            if uni_ok and major_ok:
                gate_ok = True
                break
        if not gate_ok:
            zero_gate_eligible.append(p["id"])
    print(f"Profiles with zero topically-relevant scholarships: {zero_relevant}")
    print(f"Profiles with zero gate-eligible relevant scholarships: {zero_gate_eligible}")


if __name__ == "__main__":
    main()
