/**
 * Nhóm 5 — Gợi ý học bổng (Matching) — Bảng 5.1.
 * Chạy độc lập, mặc định nhắm vào backend ĐÃ HOST.
 *
 * POST /ai/scholarship-recommendations x100, luân phiên source=scholarship_list /
 * scholarship_detail (cần 1 scholarship_id thật, lấy từ GET /scholarships) và limit 1-5.
 * Có delay giữa các lần gọi để tránh vượt rate limit.
 *
 * Usage:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... \
 *   npx ts-node -r tsconfig-paths/register test/load/group-05-goi-y-hoc-bong.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BACKEND_URL || 'https://s360-api.ygaps.com/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-05-results');
const DELAY_MS = parseInt(process.env.BENCH_DELAY_MS || '3000', 10);
const N_TOTAL = 100;
const START = parseInt(process.env.BENCH_START || '1', 10);
const END = parseInt(process.env.BENCH_END || String(N_TOTAL), 10);

interface Sample {
  iteration: number;
  source: string;
  limit: number;
  ok: boolean;
  status?: number;
  latencyMs: number;
  returnedCount?: number;
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

  console.log(`[Nhóm 5] Đăng nhập ${EMAIL} tại ${BASE_URL} ...`);
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const scholarshipsRes = await axios.get(`${BASE_URL}/scholarships`, { headers: auth });
  const list = scholarshipsRes.data?.data ?? [];
  const sampleScholarshipId: string | undefined = list[0]?.id;
  if (!sampleScholarshipId) console.warn('[Nhóm 5] Không tìm thấy scholarship nào — case scholarship_detail sẽ bị bỏ qua.');

  const samples: Sample[] = [];
  console.log(`[Nhóm 5] POST /ai/scholarship-recommendations — lô câu ${START}-${END}/${N_TOTAL} (delay ${DELAY_MS}ms) ...`);
  for (let i = START; i <= END; i++) {
    const useDetail = i % 2 === 0 && sampleScholarshipId;
    const source = useDetail ? 'scholarship_detail' : 'scholarship_list';
    const limit = ((i % 5) + 1);
    const body: Record<string, unknown> = { source, limit };
    if (useDetail) body.currentScholarshipId = sampleScholarshipId;

    const start = Date.now();
    try {
      const res = await axios.post(`${BASE_URL}/ai/scholarship-recommendations`, body, { headers: auth, timeout: 30000 });
      samples.push({
        iteration: i, source, limit, ok: true, status: 200, latencyMs: Date.now() - start,
        returnedCount: res.data?.data?.returned_count,
      });
      process.stdout.write('.');
    } catch (err: any) {
      samples.push({ iteration: i, source, limit, ok: false, status: err?.response?.status, latencyMs: Date.now() - start, error: err?.message || String(err) });
      process.stdout.write('x');
    }
    if (i < END) await sleep(DELAY_MS);
  }
  console.log('');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = `batch-${String(START).padStart(3, '0')}-${String(END).padStart(3, '0')}`;
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = ['iteration,source,limit,ok,status,latency_ms,returned_count,error'];
  for (const s of samples) csv.push([s.iteration, s.source, s.limit, s.ok, s.status ?? '', s.latencyMs, s.returnedCount ?? '', (s.error ?? '').replace(/,/g, ';')].join(','));
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.csv`), csv.join('\n'), 'utf8');

  const s = summarize(samples);
  console.log('\n=== TỔNG HỢP NHÓM 5 — GỢI Ý HỌC BỔNG (MATCHING) ===');
  console.log(`POST /ai/scholarship-recommendations  TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99} (${s.ok}/${s.n} ok)`);

  const md = `# Nhóm 5 — Gợi ý học bổng (Matching)\n\nBackend: ${BASE_URL}\nThời gian: ${new Date().toISOString()}\nDelay giữa các lần gọi: ${DELAY_MS}ms\n\n| Endpoint | N | Đạt | TB(ms) | P50 | P95 | P99 |\n|---|---|---|---|---|---|---|\n| POST /ai/scholarship-recommendations | ${s.n} | ${s.ok}/${s.n} | ${s.avgMs} | ${s.p50} | ${s.p95} | ${s.p99} |\n`;
  fs.writeFileSync(path.join(OUT_DIR, `summary-${tag}-${ts}.md`), md, 'utf8');
  console.log(`\nĐã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
