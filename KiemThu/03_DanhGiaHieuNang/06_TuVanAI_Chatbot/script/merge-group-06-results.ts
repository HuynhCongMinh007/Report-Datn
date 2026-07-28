/**
 * Gộp toàn bộ file raw-batch-*.json trong group-06-results/ (hoặc thư mục truyền qua
 * BENCH_OUT_DIR) thành 1 bảng tổng hợp — TB/P50/P95/P99 toàn cục, độ phủ 28 tools (dựa trên
 * targetTool dự định — xem README.md để biết cách đối chiếu với log AI Service để xác nhận tool
 * THỰC SỰ được gọi).
 *
 * Usage:
 *   BENCH_OUT_DIR=test/load/group-06-results \
 *   npx ts-node -r tsconfig-paths/register test/load/merge-group-06-results.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-06-results');

interface Sample {
  iteration: number;
  targetTool: string;
  question: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  intent?: string;
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
  console.log(`Tổng: ${s.n} câu (từ ${files.length} file lô), đạt ${s.ok}/${s.n}`);
  console.log(`TB=${s.avgMs}ms P50=${s.p50} P95=${s.p95} P99=${s.p99}`);

  const byTool = new Map<string, Sample[]>();
  for (const sm of all) {
    if (!byTool.has(sm.targetTool)) byTool.set(sm.targetTool, []);
    byTool.get(sm.targetTool)!.push(sm);
  }

  const toolLines = ['| Tool nhắm tới | Số câu hỏi | Đạt | TB (ms) |', '|---|---|---|---|'];
  for (const [tool, list] of [...byTool.entries()].sort()) {
    const ts = summarize(list);
    toolLines.push(`| ${tool} | ${ts.n} | ${ts.ok}/${ts.n} | ${ts.avgMs} |`);
  }

  const failedLines = all
    .filter((s) => !s.ok)
    .map((s) => `| ${s.iteration} | ${s.targetTool} | ${s.status ?? '-'} | ${(s.error ?? '').slice(0, 80)} |`);

  const md = [
    '# Nhóm 6 — Tư vấn AI (Chatbot) — Kết quả tổng hợp',
    '',
    `Tổng số câu hỏi: ${s.n} (kỳ vọng 114)`,
    `Đạt: ${s.ok}/${s.n} (${((s.ok / s.n) * 100).toFixed(1)}%)`,
    `TB=${s.avgMs}ms  P50=${s.p50}ms  P95=${s.p95}ms  P99=${s.p99}ms  Min=${s.min}ms  Max=${s.max}ms`,
    '',
    '## Theo tool nhắm tới (dự định câu hỏi — chưa phải log thực tế agent đã gọi)',
    '',
    ...toolLines,
    '',
    '## Câu hỏi lỗi',
    '',
    failedLines.length > 0
      ? ['| Câu # | Tool nhắm tới | Status | Lỗi |', '|---|---|---|---|', ...failedLines].join('\n')
      : '(không có)',
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'summary-merged.md'), md + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'all-merged.json'), JSON.stringify(all, null, 2), 'utf8');
  console.log(`\nĐã lưu ${path.join(OUT_DIR, 'summary-merged.md')}`);
}

main();
