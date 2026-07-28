/**
 * Nhóm 7 — Đo Token/Chi phí AI. Dùng để đo lượng token vào/ra và chi phí ước tính (VND) của
 * chatbot 6-Jars trên một tập câu hỏi đại diện, phục vụ phần "đánh giá chi phí AI" của báo cáo
 * DATN.
 *
 * Dùng POST /ai/chat (non-stream) — response đã có usage.{tokens_in,tokens_out,cost_vnd} kể từ khi
 * pipeline capture-token → tính cost → ghi ai_usage_logs được nối xong (xem
 * backend/src/modules/ai_core/ai.service.ts, student360-ai/app/core/llm/pricing.py).
 *
 * Bộ câu hỏi: lấy subset từ `group-06-questions.ts` (184 câu, phủ 28 AI tools) — lấy mọi câu tại
 * index chia hết cho 3 (0-based) → ~62 câu, rải đều theo mọi block tool. Không tạo dataset riêng để
 * tránh trùng lặp — nếu group-06-questions.ts được cập nhật thêm câu, subset này tự động đổi theo.
 *
 * Usage (chạy 1 lô câu hỏi 1-30 trong subset):
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... BENCH_START=1 BENCH_END=30 \
 *   npx ts-node -r tsconfig-paths/register test/load/group-07-token-cost.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { QUESTIONS } from './group-06-questions';

const BASE_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3000/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-07-results');
const DELAY_MS = parseInt(process.env.BENCH_DELAY_MS || '3000', 10);

// Subset: mọi câu tại index chia hết cho 3 (0-based) trong bộ 184 câu gốc.
const SUBSET = QUESTIONS.filter((_, idx) => idx % 3 === 0);

const START = parseInt(process.env.BENCH_START || '1', 10);
const END = parseInt(process.env.BENCH_END || String(SUBSET.length), 10);

interface Sample {
  iteration: number;
  targetTool: string;
  question: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  intent?: string;
  answerMode?: string;
  providerUsed?: string;
  modelUsed?: string;
  tokensIn?: number;
  tokensOut?: number;
  costVnd?: number;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Set EVAL_USER_EMAIL and EVAL_USER_PASSWORD.');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const batch = SUBSET.slice(START - 1, END);
  console.log(
    `[Nhóm 7] Đăng nhập ${EMAIL} tại ${BASE_URL} ... (lô câu ${START}-${END}, ${batch.length} câu, subset=${SUBSET.length}/${QUESTIONS.length})`,
  );
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const samples: Sample[] = [];
  for (let i = 0; i < batch.length; i++) {
    const globalIdx = START + i;
    const q = batch[i];
    const start = Date.now();
    console.log(`\n[${globalIdx}/${SUBSET.length}] (${q.targetTool}) "${q.question.slice(0, 60)}..."`);
    try {
      const res = await axios.post(
        `${BASE_URL}/ai/chat`,
        { message: q.question, currentContext: '6jars' },
        { headers: auth, timeout: 90000 },
      );
      const data = res.data?.data ?? {};
      const usage = data.usage ?? {};
      samples.push({
        iteration: globalIdx,
        targetTool: q.targetTool,
        question: q.question,
        ok: true,
        status: 200,
        latencyMs: Date.now() - start,
        intent: data.intent,
        answerMode: data.answer_mode ?? data.answerMode,
        providerUsed: data.provider_used ?? data.providerUsed,
        modelUsed: data.model_used ?? data.modelUsed,
        tokensIn: usage.tokens_in ?? usage.tokensIn ?? 0,
        tokensOut: usage.tokens_out ?? usage.tokensOut ?? 0,
        costVnd: usage.cost_vnd ?? usage.costVnd ?? 0,
      });
      console.log(
        `  OK (${Date.now() - start}ms) tokens_in=${samples[samples.length - 1].tokensIn} tokens_out=${
          samples[samples.length - 1].tokensOut
        } cost_vnd=${samples[samples.length - 1].costVnd?.toFixed(2)}`,
      );
    } catch (err: any) {
      samples.push({
        iteration: globalIdx,
        targetTool: q.targetTool,
        question: q.question,
        ok: false,
        status: err?.response?.status,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      });
      console.log(`  LỖI (${Date.now() - start}ms): ${err?.message || err}`);
    }
    if (i < batch.length - 1) await sleep(DELAY_MS);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = `batch-${String(START).padStart(3, '0')}-${String(END).padStart(3, '0')}`;
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = [
    'iteration,target_tool,question,ok,status,latency_ms,intent,answer_mode,provider_used,model_used,tokens_in,tokens_out,cost_vnd,error',
  ];
  for (const s of samples)
    csv.push(
      [
        s.iteration,
        s.targetTool,
        JSON.stringify(s.question),
        s.ok,
        s.status ?? '',
        s.latencyMs,
        s.intent ?? '',
        s.answerMode ?? '',
        s.providerUsed ?? '',
        s.modelUsed ?? '',
        s.tokensIn ?? '',
        s.tokensOut ?? '',
        s.costVnd ?? '',
        (s.error ?? '').replace(/,/g, ';'),
      ].join(','),
    );
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.csv`), csv.join('\n'), 'utf8');

  const ok = samples.filter((s) => s.ok);
  const totalIn = ok.reduce((a, s) => a + (s.tokensIn ?? 0), 0);
  const totalOut = ok.reduce((a, s) => a + (s.tokensOut ?? 0), 0);
  const totalCost = ok.reduce((a, s) => a + (s.costVnd ?? 0), 0);
  console.log(`\n=== TỔNG HỢP LÔ ${START}-${END} ===`);
  console.log(`Đạt ${ok.length}/${samples.length}`);
  console.log(`Tổng tokens_in=${totalIn} tokens_out=${totalOut} tổng cost_vnd=${totalCost.toFixed(2)}`);
  console.log(`Đã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
