/**
 * Nhóm 4 — Phân loại giao dịch (LLM dự phòng) — Bảng 5.1.
 * Chạy độc lập, mặc định nhắm vào backend ĐÃ HOST.
 *
 * POST /ai/6jars/classify x100, mô tả giao dịch đa dạng trải đều nhiều loại chi tiêu (ăn uống, di
 * chuyển, giải trí, học tập, mua sắm, y tế, hoá đơn, tiết kiệm/đầu tư, từ thiện...) để đánh giá
 * tổng quan việc phân loại vào 6 hũ. Có delay giữa các lần gọi để tránh vượt rate limit Gemini API.
 *
 * Usage:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... \
 *   npx ts-node -r tsconfig-paths/register test/load/group-04-phan-loai-giao-dich.ts
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BACKEND_URL || 'https://s360-api.ygaps.com/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-04-results');
const DELAY_MS = parseInt(process.env.BENCH_DELAY_MS || '3000', 10);
const N_TOTAL = 100;
const START = parseInt(process.env.BENCH_START || '1', 10);
const END = parseInt(process.env.BENCH_END || String(N_TOTAL), 10);

const DESCRIPTIONS: { description: string; amount: number }[] = [
  { description: 'Ăn trưa với bạn ở quán cơm', amount: 45000 },
  { description: 'Cà phê sáng ở highlands', amount: 55000 },
  { description: 'Trà sữa buổi chiều', amount: 39000 },
  { description: 'Ăn tối gọi Grabfood', amount: 85000 },
  { description: 'Đi Grab đến trường', amount: 32000 },
  { description: 'Đổ xăng xe máy', amount: 70000 },
  { description: 'Vé xe buýt tháng', amount: 200000 },
  { description: 'Mua vé xem phim CGV', amount: 90000 },
  { description: 'Chơi game nạp thẻ', amount: 100000 },
  { description: 'Mua sách giáo trình lập trình', amount: 250000 },
  { description: 'Đóng học phí kỳ này', amount: 5000000 },
  { description: 'Mua khóa học online trên Udemy', amount: 350000 },
  { description: 'Mua áo thun mới', amount: 180000 },
  { description: 'Mua giày thể thao', amount: 650000 },
  { description: 'Khám bệnh ở phòng khám', amount: 300000 },
  { description: 'Mua thuốc cảm ở nhà thuốc', amount: 45000 },
  { description: 'Đóng tiền điện tháng này', amount: 220000 },
  { description: 'Đóng tiền nước', amount: 80000 },
  { description: 'Đóng tiền internet wifi', amount: 165000 },
  { description: 'Nạp tiền điện thoại', amount: 50000 },
  { description: 'Mua quà sinh nhật cho bạn', amount: 200000 },
  { description: 'Ủng hộ quỹ từ thiện của trường', amount: 100000 },
  { description: 'Góp tiền mua quà tặng thầy cô 20/11', amount: 50000 },
  { description: 'Chuyển tiền tiết kiệm vào sổ', amount: 1000000 },
  { description: 'Mua vàng tích lũy đầu tháng', amount: 500000 },
  { description: 'Thuê phòng trọ tháng này', amount: 2500000 },
  { description: 'Mua đồ dùng học tập, bút vở', amount: 60000 },
  { description: 'In tài liệu ở tiệm photo', amount: 25000 },
  { description: 'Mua đồ ăn vặt siêu thị', amount: 75000 },
  { description: 'Đi xem concert với bạn bè', amount: 450000 },
  { description: 'Mua vé máy bay về quê', amount: 1200000 },
  { description: 'Sửa laptop bị hỏng', amount: 400000 },
  { description: 'Mua chuột và bàn phím máy tính', amount: 320000 },
  { description: 'Ăn buffet cuối tuần với gia đình', amount: 350000 },
  { description: 'Mua đồ tập gym', amount: 150000 },
  { description: 'Đóng phí hội sinh viên', amount: 30000 },
  { description: 'Cắt tóc ở tiệm', amount: 60000 },
  { description: 'Mua kem chống nắng, mỹ phẩm', amount: 220000 },
  { description: 'Đổ mực máy in', amount: 40000 },
  { description: 'Sửa xe máy định kỳ', amount: 180000 },
  { description: 'Mua bảo hiểm y tế sinh viên', amount: 680000 },
  { description: 'Ăn sáng bánh mì trước khi đi học', amount: 20000 },
  { description: 'Uống trà đá vỉa hè với bạn', amount: 10000 },
  { description: 'Mua vé số ủng hộ', amount: 10000 },
  { description: 'Đăng ký gói học tiếng Anh online', amount: 890000 },
  { description: 'Mua ba lô đi học mới', amount: 380000 },
  { description: 'Chi phí đi dã ngoại cùng lớp', amount: 150000 },
  { description: 'Mua vé vào công viên giải trí', amount: 220000 },
  { description: 'Chuyển khoản góp tiền sinh nhật lớp', amount: 50000 },
  { description: 'Mua ổ cứng di động để lưu đồ án', amount: 750000 },
];

interface Sample {
  iteration: number;
  description: string;
  amount: number;
  ok: boolean;
  status?: number;
  latencyMs: number;
  suggestedJarCode?: string;
  confidence?: number;
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

  console.log(`[Nhóm 4] Đăng nhập ${EMAIL} tại ${BASE_URL} ...`);
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token: string = loginRes.data?.data?.tokens?.access_token;
  if (!token) throw new Error('Login thất bại.');
  const auth = { Authorization: `Bearer ${token}` };

  const samples: Sample[] = [];
  console.log(`[Nhóm 4] POST /ai/6jars/classify — lô câu ${START}-${END}/${N_TOTAL} (delay ${DELAY_MS}ms giữa các lần) ...`);
  for (let i = START; i <= END; i++) {
    const item = DESCRIPTIONS[(i - 1) % DESCRIPTIONS.length];
    const start = Date.now();
    try {
      const res = await axios.post(
        `${BASE_URL}/ai/6jars/classify`,
        { description: item.description, amount: item.amount },
        { headers: auth, timeout: 30000 },
      );
      samples.push({
        iteration: i, description: item.description, amount: item.amount, ok: true, status: 200,
        latencyMs: Date.now() - start,
        suggestedJarCode: res.data?.data?.suggested_jar_code,
        confidence: res.data?.data?.confidence,
      });
      process.stdout.write('.');
    } catch (err: any) {
      samples.push({
        iteration: i, description: item.description, amount: item.amount, ok: false,
        status: err?.response?.status, latencyMs: Date.now() - start, error: err?.message || String(err),
      });
      process.stdout.write('x');
    }
    if (i < END) await sleep(DELAY_MS);
  }
  console.log('');

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = `batch-${String(START).padStart(3, '0')}-${String(END).padStart(3, '0')}`;
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.json`), JSON.stringify(samples, null, 2), 'utf8');
  const csv = ['iteration,description,amount,ok,status,latency_ms,suggested_jar_code,confidence,error'];
  for (const s of samples)
    csv.push(
      [s.iteration, JSON.stringify(s.description), s.amount, s.ok, s.status ?? '', s.latencyMs, s.suggestedJarCode ?? '', s.confidence ?? '', (s.error ?? '').replace(/,/g, ';')].join(','),
    );
  fs.writeFileSync(path.join(OUT_DIR, `raw-${tag}-${ts}.csv`), csv.join('\n'), 'utf8');

  const s = summarize(samples);
  console.log('\n=== TỔNG HỢP NHÓM 4 — PHÂN LOẠI GIAO DỊCH (LLM) ===');
  console.log(`POST /ai/6jars/classify  TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99} (${s.ok}/${s.n} ok)`);

  const jarCounts: Record<string, number> = {};
  for (const sm of samples) if (sm.suggestedJarCode) jarCounts[sm.suggestedJarCode] = (jarCounts[sm.suggestedJarCode] || 0) + 1;

  const md = [
    '# Nhóm 4 — Phân loại giao dịch (LLM)',
    '',
    `Backend: ${BASE_URL}`,
    `Thời gian: ${new Date().toISOString()}`,
    `Delay giữa các lần gọi: ${DELAY_MS}ms`,
    '',
    '| Endpoint | N | Đạt | TB(ms) | P50 | P95 | P99 |',
    '|---|---|---|---|---|---|---|',
    `| POST /ai/6jars/classify | ${s.n} | ${s.ok}/${s.n} | ${s.avgMs} | ${s.p50} | ${s.p95} | ${s.p99} |`,
    '',
    '## Phân bố hũ được gợi ý',
    '',
    '| Mã hũ | Số lần |',
    '|---|---|',
    ...Object.entries(jarCounts).map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, `summary-${tag}-${ts}.md`), md + '\n', 'utf8');
  console.log(`\nĐã lưu vào ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
