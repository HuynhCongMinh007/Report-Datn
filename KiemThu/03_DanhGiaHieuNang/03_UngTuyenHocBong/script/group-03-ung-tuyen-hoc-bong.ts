/**
 * Nhóm 3 — Ứng tuyển học bổng (tạo hồ sơ) — Bảng 5.1.
 * Chạy độc lập, mặc định nhắm vào backend ĐÃ HOST.
 *
 * GIỚI HẠN ĐÃ BIẾT (xem business-flows.e2e-spec.ts): DELETE /student-scholarships/:id không xoá
 * được hồ sơ thật (bug repository — where-clause so account_id thay vì user_id, 0 dòng khớp) nên
 * không thể tạo rồi dọn dẹp hồ sơ thật. Nhóm này vì vậy chỉ đo được nhánh "từ chối ID không tồn
 * tại" (POST /scholarships/register, không ghi dữ liệu) — an toàn lặp lại 100 lần, nhưng KHÔNG đại
 * diện cho độ trễ của một lần "tạo hồ sơ" thành công thật.
 *
 * Endpoint & phân bổ (~100 request):
 *   - POST /scholarships/register (id không tồn tại, no side effects) x100
 *
 * Usage:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... \
 *   npx ts-node -r tsconfig-paths/register test/load/group-03-ung-tuyen-hoc-bong.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.E2E_BACKEND_URL || 'https://s360-api.ygaps.com/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-03-results');

interface Sample {
  iteration: number;
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
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

  console.log(`[Nhóm 3] Đăng nhập ${EMAIL} tại ${BASE_URL} ...`);
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const samples: Sample[] = [];
  console.log('[Nhóm 3] POST /scholarships/register (case từ chối) x100 ...');
  for (let i = 1; i <= 100; i++) {
    const start = Date.now();
    try {
      await axios.post(
        `${BASE_URL}/scholarships/register`,
        {
          scholarship_id: randomUUID(),
          note: `[group-03-ung-tuyen] probe ${i}`,
          isDraft: true,
        },
        { headers: auth, validateStatus: () => true },
      );
      samples.push({ iteration: i, ok: true, status: 404, latencyMs: Date.now() - start });
    } catch (err: any) {
      samples.push({ iteration: i, ok: false, status: err?.response?.status, latencyMs: Date.now() - start, error: err?.message || String(err) });
    }
    process.stdout.write('.');
  }
  console.log('');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT_DIR, `raw-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = ['iteration,ok,status,latency_ms,error'];
  for (const s of samples) csv.push([s.iteration, s.ok, s.status ?? '', s.latencyMs, (s.error ?? '').replace(/,/g, ';')].join(','));
  fs.writeFileSync(path.join(OUT_DIR, `raw-${ts}.csv`), csv.join('\n'), 'utf8');

  const s = summarize(samples);
  console.log('\n=== TỔNG HỢP NHÓM 3 — ỨNG TUYỂN HỌC BỔNG (case từ chối) ===');
  console.log(`POST /scholarships/register  TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99} (${s.ok}/${s.n} ok)`);

  const md = `# Nhóm 3 — Ứng tuyển học bổng\n\nBackend: ${BASE_URL}\nThời gian: ${new Date().toISOString()}\n\n**Lưu ý**: chỉ đo được nhánh "từ chối ID không tồn tại" — xem giới hạn ở đầu file script.\n\n| Endpoint | N | Đạt | TB(ms) | P50 | P95 | P99 |\n|---|---|---|---|---|---|---|\n| POST /scholarships/register (case từ chối) | ${s.n} | ${s.ok}/${s.n} | ${s.avgMs} | ${s.p50} | ${s.p95} | ${s.p99} |\n`;
  fs.writeFileSync(path.join(OUT_DIR, `summary-${ts}.md`), md, 'utf8');
  console.log(`\nĐã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
