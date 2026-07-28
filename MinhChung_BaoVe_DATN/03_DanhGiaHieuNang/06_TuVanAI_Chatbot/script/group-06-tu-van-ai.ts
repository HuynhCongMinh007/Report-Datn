/**
 * Nhóm 6 — Tư vấn AI (Chatbot) — Bảng 5.1. 114 câu hỏi (khớp báo cáo), thiết kế để phủ 28 AI tools
 * (xem group-06-questions.ts). Chạy độc lập, mặc định nhắm vào backend ĐÃ HOST.
 *
 * Dùng POST /ai/chat (non-stream) — nhanh hơn và dễ đo hơn SSE nhưng vẫn đi qua đúng ReAct loop /
 * tool-calling như /ai/chat/stream. Có delay giữa các lần gọi để tránh vượt rate limit Gemini.
 *
 * Vì tổng thời gian chạy 114 câu (mỗi câu ~15-40s + delay) có thể vượt 30-40 phút, script hỗ trợ
 * chạy theo LÔ qua BENCH_START/BENCH_END (1-indexed, inclusive) — mỗi lô ghi file riêng theo range
 * để không mất dữ liệu nếu 1 lô bị ngắt; gộp lại bằng merge-group-06-results.ts sau khi chạy đủ.
 *
 * Usage (chạy 1 lô câu hỏi 1-19):
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... BENCH_START=1 BENCH_END=19 \
 *   npx ts-node -r tsconfig-paths/register test/load/group-06-tu-van-ai.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { QUESTIONS } from './group-06-questions';

const BASE_URL = process.env.E2E_BACKEND_URL || 'https://s360-api.ygaps.com/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-06-results');
const DELAY_MS = parseInt(process.env.BENCH_DELAY_MS || '3000', 10);
const START = parseInt(process.env.BENCH_START || '1', 10);
const END = parseInt(process.env.BENCH_END || String(QUESTIONS.length), 10);

interface Sample {
  iteration: number;
  targetTool: string;
  question: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  intent?: string;
  replyPreview?: string;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(samples: Sample[]) {
  const ok = samples.filter((s) => s.ok);
  const lat = ok.map((s) => s.latencyMs).sort((a, b) => a - b);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  return {
    n: samples.length, ok: ok.length, avgMs: Math.round(avg * 10) / 10,
    p50: percentile(lat, 50), p95: percentile(lat, 95), p99: percentile(lat, 99),
    min: lat[0] ?? 0, max: lat[lat.length - 1] ?? 0,
  };
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Set EVAL_USER_EMAIL and EVAL_USER_PASSWORD.');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const batch = QUESTIONS.slice(START - 1, END);
  console.log(`[Nhóm 6] Đăng nhập ${EMAIL} tại ${BASE_URL} ... (lô câu ${START}-${END}, ${batch.length} câu)`);
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const samples: Sample[] = [];
  for (let i = 0; i < batch.length; i++) {
    const globalIdx = START + i;
    const q = batch[i];
    const start = Date.now();
    console.log(`\n[${globalIdx}/${QUESTIONS.length}] (${q.targetTool}) "${q.question.slice(0, 60)}..."`);
    try {
      const res = await axios.post(
        `${BASE_URL}/ai/chat`,
        { message: q.question, currentContext: '6jars' },
        { headers: auth, timeout: 90000 },
      );
      const reply: string = res.data?.data?.reply ?? '';
      samples.push({
        iteration: globalIdx, targetTool: q.targetTool, question: q.question, ok: true, status: 200,
        latencyMs: Date.now() - start, intent: res.data?.data?.intent,
        replyPreview: reply.slice(0, 200),
      });
      console.log(`  OK (${Date.now() - start}ms) intent=${res.data?.data?.intent ?? 'N/A'}`);
    } catch (err: any) {
      samples.push({
        iteration: globalIdx, targetTool: q.targetTool, question: q.question, ok: false,
        status: err?.response?.status, latencyMs: Date.now() - start, error: err?.message || String(err),
      });
      console.log(`  LỖI (${Date.now() - start}ms): ${err?.message || err}`);
    }
    if (i < batch.length - 1) await sleep(DELAY_MS);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = `batch-${String(START).padStart(3, '0')}-${String(END).padStart(3, '0')}`;
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = ['iteration,target_tool,question,ok,status,latency_ms,intent,error'];
  for (const s of samples)
    csv.push([s.iteration, s.targetTool, JSON.stringify(s.question), s.ok, s.status ?? '', s.latencyMs, s.intent ?? '', (s.error ?? '').replace(/,/g, ';')].join(','));
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.csv`), csv.join('\n'), 'utf8');

  const s = summarize(samples);
  console.log(`\n=== TỔNG HỢP LÔ ${START}-${END} ===`);
  console.log(`POST /ai/chat  TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99} (${s.ok}/${s.n} ok)`);
  console.log(`Đã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
