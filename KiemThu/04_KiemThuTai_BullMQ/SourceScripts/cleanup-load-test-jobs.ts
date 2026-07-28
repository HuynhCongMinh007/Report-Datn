/**
 * One-off cleanup: remove any remaining "[Load Test]" notification jobs
 * from the BullMQ 'notification' queue (waiting/delayed only — jobs already
 * completed or failed have already run and can't be un-run). Run this if a
 * notification-queue-load-test.ts run needs to be stopped early.
 */
import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const queue = new Queue('notification', {
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  });

  const waiting = await queue.getWaiting(0, 100000);
  const delayed = await queue.getDelayed(0, 100000);
  const active = await queue.getActive(0, 100000);

  const candidates = [...waiting, ...delayed];
  const loadTestJobs = candidates.filter((j) =>
    typeof j.data?.title === 'string' && j.data.title.startsWith('[Load Test]'),
  );

  console.log(`waiting=${waiting.length} delayed=${delayed.length} active=${active.length}`);
  console.log(`Removing ${loadTestJobs.length} pending [Load Test] jobs...`);

  let removed = 0;
  let skipped = 0;
  for (const job of loadTestJobs) {
    try {
      await job.remove();
      removed++;
    } catch (err: any) {
      skipped++; // likely locked (actively being processed right now) — will finish on its own
    }
  }
  console.log(`Removed: ${removed}, skipped (locked/in-progress): ${skipped}`);

  const remainingWaiting = await queue.getWaiting(0, 10);
  console.log(`Done. Remaining waiting jobs (sample): ${remainingWaiting.length}`);

  await queue.close();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
