/**
 * Gộp toàn bộ file raw-batch-*.json trong group-07-results/ (hoặc thư mục truyền qua
 * BENCH_OUT_DIR) thành 1 bảng tổng hợp token/chi phí — theo targetTool, và bảng ước tính chi phí ở
 * quy mô lớn hơn (ngoại suy tuyến tính từ mẫu).
 *
 * Usage:
 *   BENCH_OUT_DIR=test/load/group-07-results \
 *   npx ts-node -r tsconfig-paths/register test/load/merge-group-07-results.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = process.env.BENCH_OUT_DIR || path.join(__dirname, 'group-07-results');

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

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
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

  const ok = all.filter((s) => s.ok);
  const totalIn = ok.reduce((a, s) => a + (s.tokensIn ?? 0), 0);
  const totalOut = ok.reduce((a, s) => a + (s.tokensOut ?? 0), 0);
  const totalCost = ok.reduce((a, s) => a + (s.costVnd ?? 0), 0);
  const avgIn = avg(ok.map((s) => s.tokensIn ?? 0));
  const avgOut = avg(ok.map((s) => s.tokensOut ?? 0));
  const avgCost = avg(ok.map((s) => s.costVnd ?? 0));
  const model = ok.find((s) => s.modelUsed)?.modelUsed ?? 'unknown';

  console.log(`Tổng: ${all.length} câu (từ ${files.length} file lô), đạt ${ok.length}/${all.length}`);
  console.log(`Tổng tokens_in=${totalIn} tokens_out=${totalOut} tổng cost_vnd=${totalCost.toFixed(2)}`);
  console.log(`TB tokens_in=${avgIn.toFixed(0)} tokens_out=${avgOut.toFixed(0)} cost_vnd=${avgCost.toFixed(2)}`);

  const byTool = new Map<string, Sample[]>();
  for (const sm of ok) {
    if (!byTool.has(sm.targetTool)) byTool.set(sm.targetTool, []);
    byTool.get(sm.targetTool)!.push(sm);
  }

  const toolLines = [
    '| Tool nhắm tới | N | TB tokens_in | TB tokens_out | TB cost_vnd | Tổng cost_vnd |',
    '|---|---|---|---|---|---|',
  ];
  for (const [tool, list] of [...byTool.entries()].sort()) {
    const ti = avg(list.map((s) => s.tokensIn ?? 0));
    const to = avg(list.map((s) => s.tokensOut ?? 0));
    const ac = avg(list.map((s) => s.costVnd ?? 0));
    const tc = list.reduce((a, s) => a + (s.costVnd ?? 0), 0);
    toolLines.push(`| ${tool} | ${list.length} | ${ti.toFixed(0)} | ${to.toFixed(0)} | ${ac.toFixed(2)} | ${tc.toFixed(2)} |`);
  }

  const failedLines = all
    .filter((s) => !s.ok)
    .map((s) => `| ${s.iteration} | ${s.targetTool} | ${s.status ?? '-'} | ${(s.error ?? '').slice(0, 80)} |`);

  // Ước tính chi phí ở quy mô — ngoại suy tuyến tính từ chi phí trung bình/request đo được.
  const scenarios = [5, 20, 60];
  const projectionLines = [
    '| Giả định tin nhắn/user/tháng | Chi phí ước tính/user/tháng (VND) | Chi phí ước tính/1000 user/tháng (VND) |',
    '|---|---|---|',
  ];
  for (const msgsPerMonth of scenarios) {
    const perUser = avgCost * msgsPerMonth;
    projectionLines.push(
      `| ${msgsPerMonth} | ${perUser.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} | ${(perUser * 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} |`,
    );
  }

  const md = [
    '# Nhóm 7 — Chi phí Token AI — Kết quả tổng hợp',
    '',
    `Model: **${model}** (Vertex AI)`,
    `Tổng số câu hỏi: ${all.length}`,
    `Đạt: ${ok.length}/${all.length} (${((ok.length / all.length) * 100).toFixed(1)}%)`,
    '',
    '## Tổng hợp token/chi phí',
    '',
    `- Tổng tokens vào: **${totalIn.toLocaleString('vi-VN')}**`,
    `- Tổng tokens ra: **${totalOut.toLocaleString('vi-VN')}**`,
    `- Tổng chi phí ước tính: **${totalCost.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} VND**`,
    `- TB tokens vào/request: **${avgIn.toFixed(0)}**`,
    `- TB tokens ra/request: **${avgOut.toFixed(0)}**`,
    `- TB chi phí/request: **${avgCost.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} VND**`,
    '',
    '## Theo tool nhắm tới (dự định câu hỏi — chưa phải log thực tế agent đã gọi)',
    '',
    ...toolLines,
    '',
    '## Ước tính chi phí ở quy mô (ngoại suy tuyến tính từ mẫu — KHÔNG phải đo thực tế)',
    '',
    ...projectionLines,
    '',
    '## Câu hỏi lỗi',
    '',
    failedLines.length > 0
      ? ['| Câu # | Tool nhắm tới | Status | Lỗi |', '|---|---|---|---|', ...failedLines].join('\n')
      : '(không có)',
    '',
    '## Giới hạn đã biết',
    '',
    '- Chưa tính chi phí các lệnh gọi LLM phụ trong turn (intent classifier, action-intent detector,',
    '  tool-refusal judge, action extractor) — số liệu là cận dưới, không phải tổng chi phí tuyệt đối.',
    '- Giá áp dụng cho tier ngữ cảnh ≤200K token của Gemini 2.5 Pro trên Vertex AI, snapshot giá chụp',
    '  ngày 2026-07-28 — cần re-check nếu GCP đổi giá.',
    '- `targetTool` trong câu hỏi là "dự định kích hoạt", không đảm bảo model luôn gọi đúng tool đó.',
  ].join('\n');

  fs.writeFileSync(path.join(OUT_DIR, 'summary.md'), md + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'all-merged.json'), JSON.stringify(all, null, 2), 'utf8');
  console.log(`\nĐã lưu ${path.join(OUT_DIR, 'summary.md')}`);
}

main();
