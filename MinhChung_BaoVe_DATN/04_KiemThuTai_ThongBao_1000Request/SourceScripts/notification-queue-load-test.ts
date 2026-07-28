/**
 * Real load test for POST /notification-queue/send-queued (BullMQ + Redis
 * notification queue), replacing the purely theoretical 100-10,000 estimate
 * in the report ("Đánh giá khả năng đáp ứng hệ thống", Chapter 6).
 *
 * Scope / safety notes (read before raising LOAD_TEST_COUNT):
 *   - Every request targets the SAME single test account (from
 *     EVAL_USER_EMAIL/EVAL_USER_PASSWORD), which has no registered mobile
 *     device — notificationService.sendToAccounts() only calls Firebase for
 *     accounts with an active device token, so this never sends a real push.
 *   - Each request still does a real INSERT into notification_job /
 *     notification_job_account on the project's database and pushes a real
 *     job onto the real BullMQ/Redis queue — so this does exercise the real
 *     infra path the report is about, just without real push side effects.
 *   - The project's DB is a remote hosted Postgres (Neon), not a disposable
 *     local one — kept the default count well under the report's original
 *     10,000 for that reason. Override via LOAD_TEST_COUNT if you've
 *     confirmed it's fine to write more rows.
 *   - There is no public GET-by-id endpoint to poll individual job
 *     completion status, so this measures REQUEST-side (enqueue) throughput
 *     and latency — accept latency into the queue — not full "delivered by
 *     worker" latency. That's a real, disclosed scope boundary, not an
 *     oversight: it's what's actually observable from outside the process.
 *
 * Usage:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... \
 *   LOAD_TEST_COUNT=1000 LOAD_TEST_CONCURRENCY=20 \
 *   npx ts-node -r tsconfig-paths/register test/load/notification-queue-load-test.ts
 */
import axios from 'axios';

const BASE_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3000/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;
const COUNT = parseInt(process.env.LOAD_TEST_COUNT || '1000', 10);
const CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || '20', 10);

interface RequestResult {
  index: number;
  ok: boolean;
  status?: number;
  latencyMs: number;
  jobStatus?: string;
  error?: string;
}

function decodeJwtPayload(token: string): any {
  const [, payloadB64] = token.split('.');
  const json = Buffer.from(payloadB64, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function login(): Promise<{ token: string; accountId: string }> {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set EVAL_USER_EMAIL and EVAL_USER_PASSWORD before running this load test.');
  }
  const res = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD });
  const token = res.data?.data?.tokens?.access_token;
  if (!token) throw new Error(`Login did not return an access_token: ${JSON.stringify(res.data)}`);
  // The StackAuthGuard resolves the JWT's `userId` claim as the Account ID
  // (see common/guards/auth-stack.guard.ts: getOrFetchAccount(payload.userId)),
  // which is exactly the id SendNotificationDTO.accountIds expects.
  const payload = decodeJwtPayload(token);
  return { token, accountId: payload.userId };
}

async function sendOne(token: string, accountId: string, index: number): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await axios.post(
      `${BASE_URL}/notification-queue/send-queued`,
      {
        account_ids: [accountId],
        title: `[Load Test] Cập nhật thông báo #${index}`,
        body: 'Kiểm thử tải hàng đợi BullMQ/Redis — không gửi push thật (tài khoản test không có thiết bị đăng ký).',
        category: 'system',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
        validateStatus: () => true,
      },
    );
    const latencyMs = Date.now() - start;
    return {
      index,
      ok: res.status === 200,
      status: res.status,
      latencyMs,
      jobStatus: res.data?.data?.status,
    };
  } catch (err: any) {
    return {
      index,
      ok: false,
      latencyMs: Date.now() - start,
      error: err.message || String(err),
    };
  }
}

async function runWithConcurrency<T>(
  items: number[],
  concurrency: number,
  worker: (i: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(`Đăng nhập tài khoản test...`);
  const { token, accountId } = await login();
  console.log(`Đã đăng nhập. accountId (đối tượng nhận thông báo test): ${accountId}`);
  console.log(
    `Bắn ${COUNT} request POST /notification-queue/send-queued, concurrency=${CONCURRENCY}...\n`,
  );

  const overallStart = Date.now();
  const results = await runWithConcurrency(
    Array.from({ length: COUNT }, (_, i) => i + 1),
    CONCURRENCY,
    (i) => sendOne(token, accountId, i),
  );
  const overallMs = Date.now() - overallStart;

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const throughput = COUNT / (overallMs / 1000);

  console.log('=== Kết quả load test hàng đợi thông báo (tự động, tái lập được) ===');
  console.log(`Tổng số request: ${COUNT} (concurrency client=${CONCURRENCY})`);
  console.log(`Thành công (enqueue OK): ${ok.length}`);
  console.log(`Thất bại: ${failed.length}`);
  console.log(`Tổng thời gian chạy: ${(overallMs / 1000).toFixed(2)}s`);
  console.log(`Throughput enqueue: ${throughput.toFixed(1)} req/s`);
  console.log(`\nĐộ trễ enqueue (POST -> response, ms):`);
  console.log(`  P50: ${p50}`);
  console.log(`  P95: ${p95}`);
  console.log(`  P99: ${p99}`);
  console.log(`  Avg: ${avg.toFixed(1)}`);

  if (failed.length > 0) {
    console.log(`\nMẫu lỗi (tối đa 10):`);
    for (const r of failed.slice(0, 10)) {
      console.log(`  #${r.index} status=${r.status ?? 'N/A'} error=${r.error ?? 'N/A'}`);
    }
  }

  const statusCounts: Record<string, number> = {};
  for (const r of ok) {
    const s = r.jobStatus || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log(`\nTrạng thái job ngay sau enqueue (chưa chắc đã xử lý xong, worker chạy bất đồng bộ):`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log(
    `\nLưu ý: đây là độ trễ/enqueue throughput phía API + ghi DB + đẩy job vào Redis. ` +
      `Không có endpoint GET công khai theo job id để tự động chờ xác nhận worker đã xử lý xong ` +
      `(trạng thái SENT) — nên đây là số liệu về khả năng TIẾP NHẬN tải của hàng đợi, không phải ` +
      `độ trễ xử lý toàn trình đến khi gửi xong.`,
  );
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
