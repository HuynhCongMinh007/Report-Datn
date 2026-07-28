/**
 * Nhóm 1 — CRUD cơ bản (Bảng 5.1) — giao dịch, hũ, điểm.
 * Chạy độc lập, mặc định nhắm vào backend ĐÃ HOST (theo yêu cầu — không cần AI Service).
 *
 * Endpoint & phân bổ (~100 request):
 *   - GET /finance/jars                          x34
 *   - POST+GET+DELETE /finance/transactions       x22 chu kỳ (66 request)
 *
 * Usage:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... \
 *   npx ts-node -r tsconfig-paths/register test/load/group-01-crud-co-ban.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BACKEND_URL || 'https://s360-api.ygaps.com/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-01-results');

interface Sample {
  iteration: number;
  endpoint: string;
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
    n: samples.length,
    ok: ok.length,
    avgMs: Math.round(avg * 10) / 10,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    min: lat[0] ?? 0,
    max: lat[lat.length - 1] ?? 0,
  };
}

async function timeCall(endpoint: string, iteration: number, fn: () => Promise<unknown>): Promise<Sample> {
  const start = Date.now();
  try {
    await fn();
    return { iteration, endpoint, ok: true, status: 200, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      iteration,
      endpoint,
      ok: false,
      status: err?.response?.status,
      latencyMs: Date.now() - start,
      error: err?.message || String(err),
    };
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Set EVAL_USER_EMAIL and EVAL_USER_PASSWORD.');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[Nhóm 1] Đăng nhập ${EMAIL} tại ${BASE_URL} ...`);
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const jarsRes = await axios.get(`${BASE_URL}/finance/jars`, { headers: auth });
  const essentialsJarId = jarsRes.data.data.find((j: any) => j.code === 'essentials')?.id;
  if (!essentialsJarId) throw new Error('Tài khoản thiếu hũ "essentials".');

  const samples: Sample[] = [];

  console.log('[Nhóm 1] GET /finance/jars x34 ...');
  for (let i = 1; i <= 34; i++) {
    samples.push(await timeCall('GET /finance/jars', i, () => axios.get(`${BASE_URL}/finance/jars`, { headers: auth })));
    process.stdout.write('.');
  }
  console.log('');

  console.log('[Nhóm 1] POST+GET+DELETE /finance/transactions x22 chu kỳ ...');
  for (let i = 1; i <= 22; i++) {
    const start = Date.now();
    try {
      const createRes = await axios.post(
        `${BASE_URL}/finance/transactions`,
        {
          type: 'expense',
          amount: 1000 + i,
          description: `[group-01-crud] iteration ${i}`,
          moneyJarId: essentialsJarId,
          transactionDate: new Date().toISOString(),
        },
        { headers: auth },
      );
      samples.push({ iteration: i, endpoint: 'POST /finance/transactions', ok: true, status: 201, latencyMs: Date.now() - start });

      const id = createRes.data.data.id;
      const getStart = Date.now();
      await axios.get(`${BASE_URL}/finance/transactions/${id}`, { headers: auth });
      samples.push({ iteration: i, endpoint: 'GET /finance/transactions/:id', ok: true, status: 200, latencyMs: Date.now() - getStart });

      const delStart = Date.now();
      await axios.delete(`${BASE_URL}/finance/transactions/${id}`, { headers: auth });
      samples.push({ iteration: i, endpoint: 'DELETE /finance/transactions/:id', ok: true, status: 200, latencyMs: Date.now() - delStart });
    } catch (err: any) {
      samples.push({
        iteration: i,
        endpoint: 'POST+GET+DELETE /finance/transactions (cycle)',
        ok: false,
        status: err?.response?.status,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      });
    }
    process.stdout.write('.');
  }
  console.log('');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT_DIR, `raw-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = ['iteration,endpoint,ok,status,latency_ms,error'];
  for (const s of samples) csv.push([s.iteration, s.endpoint, s.ok, s.status ?? '', s.latencyMs, (s.error ?? '').replace(/,/g, ';')].join(','));
  fs.writeFileSync(path.join(OUT_DIR, `raw-${ts}.csv`), csv.join('\n'), 'utf8');

  console.log('\n=== TỔNG HỢP NHÓM 1 — CRUD CƠ BẢN ===');
  const byEndpoint = new Map<string, Sample[]>();
  for (const s of samples) {
    if (!byEndpoint.has(s.endpoint)) byEndpoint.set(s.endpoint, []);
    byEndpoint.get(s.endpoint)!.push(s);
  }
  const lines = ['| Endpoint | N | Đạt | TB(ms) | P50 | P95 | P99 |', '|---|---|---|---|---|---|---|'];
  for (const [endpoint, list] of byEndpoint) {
    const s = summarize(list);
    lines.push(`| ${endpoint} | ${s.n} | ${s.ok}/${s.n} | ${s.avgMs} | ${s.p50} | ${s.p95} | ${s.p99} |`);
    console.log(`${endpoint.padEnd(40)} TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} (${s.ok}/${s.n} ok)`);
  }
  fs.writeFileSync(path.join(OUT_DIR, `summary-${ts}.md`), `# Nhóm 1 — CRUD cơ bản\n\nBackend: ${BASE_URL}\nThời gian: ${new Date().toISOString()}\n\n${lines.join('\n')}\n`, 'utf8');
  console.log(`\nĐã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
