"""
Reproducible accuracy eval for POST /ai/6jars/classify (transaction -> jar).

Replaces the manual, non-reproducible "~500 lượt thử thủ công" estimate in
the report (Chapter 6, 6.4.1) with a fixed labeled dataset run through the
real backend + AI service end-to-end, producing an accuracy number and
confusion matrix that can be re-run and reproduced.

Usage:
    export EVAL_USER_EMAIL=...
    export EVAL_USER_PASSWORD=...
    python tests/eval/eval_classification.py

Requires the backend (NestJS) running locally with a real DB-backed user
that already has the 6 system jars set up (see BACKEND_URL below).
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

BACKEND_URL = os.environ.get("EVAL_BACKEND_URL", "http://localhost:3000/api")
DATASET_PATH = Path(
    os.environ.get("EVAL_DATASET_PATH")
    or (Path(__file__).parent / "data" / "classification_eval_set.json")
)
REPORT_DIR = Path(__file__).parent / "reports"
CONCURRENCY = int(os.environ.get("EVAL_CONCURRENCY", "1"))
REQUEST_DELAY_SECONDS = float(os.environ.get("EVAL_REQUEST_DELAY", "4.0"))
MAX_RETRIES = 4


async def login(client: httpx.AsyncClient) -> str:
    token = os.environ.get("EVAL_ACCESS_TOKEN")
    if token:
        return token

    email = os.environ.get("EVAL_USER_EMAIL")
    password = os.environ.get("EVAL_USER_PASSWORD")
    if not email or not password:
        print(
            "Missing credentials: set EVAL_USER_EMAIL + EVAL_USER_PASSWORD, "
            "or EVAL_ACCESS_TOKEN directly.",
            file=sys.stderr,
        )
        sys.exit(1)

    resp = await client.post(
        f"{BACKEND_URL}/auth/login", json={"email": email, "password": password}
    )
    resp.raise_for_status()
    return resp.json()["data"]["tokens"]["access_token"]


async def classify_one(
    client: httpx.AsyncClient, token: str, sem: asyncio.Semaphore, item: dict
) -> dict:
    async with sem:
        payload = {"description": item["description"]}
        if item.get("amount"):
            payload["amount"] = item["amount"]

        predicted, confidence, source, error = None, None, None, None
        rate_limited_retries = 0

        for attempt in range(MAX_RETRIES + 1):
            try:
                resp = await client.post(
                    f"{BACKEND_URL}/ai/6jars/classify",
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=60.0,
                )
                resp.raise_for_status()
                data = resp.json()["data"]
                predicted = data.get("suggested_jar_code")
                confidence = data.get("confidence")
                source = data.get("source")

                # The AI service catches its own LLM errors (e.g. Vertex 429
                # RESOURCE_EXHAUSTED) and silently falls back to
                # suggested_jar_code="essentials", confidence=0.0 instead of
                # surfacing an HTTP error. Detect that fallback and retry
                # here instead of counting it as a real misclassification.
                if confidence == 0.0 and source == "ai" and attempt < MAX_RETRIES:
                    rate_limited_retries += 1
                    await asyncio.sleep(REQUEST_DELAY_SECONDS * (2 ** attempt))
                    continue
                error = None
                break
            except Exception as exc:  # noqa: BLE001
                error = str(exc)
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(REQUEST_DELAY_SECONDS * (2 ** attempt))
                    continue

        await asyncio.sleep(REQUEST_DELAY_SECONDS)

        return {
            "id": item["id"],
            "description": item["description"],
            "expected_jar": item["expected_jar"],
            "predicted_jar": predicted,
            "correct": predicted == item["expected_jar"],
            "confidence": confidence,
            "source": source,
            "error": error,
            "rate_limited_retries": rate_limited_retries,
        }


async def run() -> None:
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    items = dataset["items"]
    jars = dataset["jars"]

    async with httpx.AsyncClient() as client:
        token = await login(client)
        sem = asyncio.Semaphore(CONCURRENCY)
        print(f"Running {len(items)} classification calls against {BACKEND_URL} "
              f"(concurrency={CONCURRENCY})...")
        results = await asyncio.gather(
            *(classify_one(client, token, sem, item) for item in items)
        )

    # ── Aggregate ────────────────────────────────────────────────────────
    total = len(results)
    correct = sum(r["correct"] for r in results)
    errors = [r for r in results if r["error"]]
    total_retries = sum(r.get("rate_limited_retries", 0) for r in results)

    per_jar_total: dict[str, int] = defaultdict(int)
    per_jar_correct: dict[str, int] = defaultdict(int)
    confusion: dict[str, dict[str, int]] = {j: defaultdict(int) for j in jars}

    for r in results:
        exp = r["expected_jar"]
        per_jar_total[exp] += 1
        if r["correct"]:
            per_jar_correct[exp] += 1
        pred = r["predicted_jar"] or "(none)"
        confusion[exp][pred] += 1

    accuracy = correct / total if total else 0.0

    print("\n=== Kết quả đánh giá phân loại giao dịch (tự động, tái lập được) ===")
    print(f"Tổng mẫu thử: {total}")
    print(f"Số mẫu phân loại đúng: {correct}")
    print(f"Độ chính xác (Accuracy): {accuracy * 100:.1f}%")
    if errors:
        print(f"Lỗi gọi API (loại khỏi tính accuracy như sai): {len(errors)}")
    if total_retries:
        print(f"Lượt retry do LLM rate-limit (429) trong quá trình chạy: {total_retries}")

    print("\nTheo từng hũ:")
    print(f"{'Hũ':<14}{'Tổng mẫu':<12}{'Đúng':<8}{'Accuracy':<10}")
    for jar in jars:
        t = per_jar_total.get(jar, 0)
        c = per_jar_correct.get(jar, 0)
        acc = (c / t * 100) if t else 0.0
        print(f"{jar:<14}{t:<12}{c:<8}{acc:<9.1f}%")

    print("\nMa trận nhầm lẫn (hàng = nhãn đúng, cột = dự đoán):")
    header = "expected \\ predicted".ljust(14) + "".join(f"{j:<12}" for j in jars) + "(none)"
    print(header)
    for exp in jars:
        row = confusion[exp]
        line = exp.ljust(14) + "".join(f"{row.get(j, 0):<12}" for j in jars) + str(row.get("(none)", 0))
        print(line)

    # ── Save report ─────────────────────────────────────────────────────
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "backend_url": BACKEND_URL,
        "dataset": os.path.relpath(DATASET_PATH, Path(__file__).parent.parent.parent),
        "total": total,
        "correct": correct,
        "accuracy": accuracy,
        "per_jar": {
            jar: {
                "total": per_jar_total.get(jar, 0),
                "correct": per_jar_correct.get(jar, 0),
                "accuracy": (per_jar_correct.get(jar, 0) / per_jar_total[jar])
                if per_jar_total.get(jar)
                else None,
            }
            for jar in jars
        },
        "confusion_matrix": {jar: dict(confusion[jar]) for jar in jars},
        "results": results,
    }
    out_path = REPORT_DIR / f"classification_eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nBáo cáo chi tiết đã lưu: {out_path}")


if __name__ == "__main__":
    asyncio.run(run())
