/**
 * Gộp các file raw-batch-*.json (Nhóm 4 hoặc Nhóm 5, chạy theo lô) thành 1 bảng tổng hợp.
 *
 * Usage:
 *   BENCH_OUT_DIR=test/load/group-04-results BENCH_LABEL="Nhóm 4 — Phân loại giao dịch (LLM)" \
 *   npx ts-node -r tsconfig-paths/register test/load/merge-batch-results.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-04-results');
const LABEL = process.env.BENCH_LABEL || 'Nhóm';

interface Sample {
  iteration: number;
  ok: boolean;
  status?: number;
  latencyMs: number;
  [key: string]: unknown;
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

function main() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.startsWith('raw-batch-') && f.endsWith('.json'));
  if (files.length === 0) throw new Error(`Không tìm thấy file raw-batch-*.json trong ${OUT_DIR}`);

  const all: Sample[] = [];
  for (const f of files) {
    const data: Sample[] = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
    all.push(...data);
  }
  all.sort((a, b) => a.iteration - b.iteration);

  const s = summarize(all);
  console.log(`Tổng: ${s.n} (từ ${files.length} file lô), đạt ${s.ok}/${s.n}`);
  console.log(`TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99}`);

  const failed = all.filter((sm) => !sm.ok);
  const md = [
    `# ${LABEL} — Kết quả tổng hợp`,
    '',
    `Tổng số lần gọi: ${s.n}`,
    `Đạt: ${s.ok}/${s.n} (${((s.ok / s.n) * 100).toFixed(1)}%)`,
    `TB=${s.avgMs}ms  P50=${s.p50}ms  P95=${s.p95}ms  P99=${s.p99}ms  Min=${s.min}ms  Max=${s.max}ms`,
    '',
    '## Chi tiết lỗi (nếu có)',
    '',
    failed.length > 0
      ? failed.map((f) => `- #${f.iteration}: status=${f.status ?? '-'} error=${String(f.error ?? '').slice(0, 100)}`).join('\n')
      : '(không có lỗi)',
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'summary-merged.md'), md + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'all-merged.json'), JSON.stringify(all, null, 2), 'utf8');
  console.log(`\nĐã lưu ${path.join(OUT_DIR, 'summary-merged.md')}`);
}

main();
