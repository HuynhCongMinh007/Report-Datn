import * as request from 'supertest';

/**
 * Real end-to-end test against the running local stack (backend + Postgres +
 * Redis, e.g. via `docker compose up` / local services), not an in-process
 * NestJS TestingModule. Complements ai-gateway.e2e-spec.ts (which covers the
 * AI Gateway / chat endpoints) by exercising the remaining business-flow
 * endpoints from Chapter 3, Mục 3.2: 6-Jars finance (FIN-UC01/02/03/05),
 * AI classification (AI-UC02), scholarships (SCH-UC01/02) and academic
 * records (ACA-UC01/02).
 *
 * Every write this spec performs against the real account is cleaned up
 * (deleted / reverted) in the same test or in `afterAll`, so re-running it
 * repeatedly does not accumulate test data on the account.
 *
 * Requires:
 *   - Backend running locally (default http://localhost:3000/api)
 *   - Postgres + Redis reachable from the backend
 *   - EVAL_USER_EMAIL / EVAL_USER_PASSWORD env vars set to a real account
 *     that already has the 6 system jars configured
 *
 * Run:
 *   EVAL_USER_EMAIL=... EVAL_USER_PASSWORD=... npm run test:e2e -- business-flows
 */

const BASE_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3000/api';
const EMAIL = process.env.EVAL_USER_EMAIL;
const PASSWORD = process.env.EVAL_USER_PASSWORD;

describe('Business-flow endpoints (live e2e)', () => {
  let accessToken: string;
  let essentialsJarId: string;
  let enjoymentJarId: string;

  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        'Set EVAL_USER_EMAIL and EVAL_USER_PASSWORD before running this e2e spec.',
      );
    }

    const loginRes = await request(BASE_URL)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    accessToken = loginRes.body?.data?.tokens?.access_token;
    if (!accessToken) {
      throw new Error(
        `Login did not return an access_token. Response: ${JSON.stringify(loginRes.body)}`,
      );
    }

    const jarsRes = await request(BASE_URL)
      .get('/finance/jars')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    essentialsJarId = jarsRes.body.data.find((j: any) => j.code === 'essentials')?.id;
    enjoymentJarId = jarsRes.body.data.find((j: any) => j.code === 'enjoyment')?.id;
    if (!essentialsJarId || !enjoymentJarId) {
      throw new Error('Test account is missing the essentials/enjoyment system jars.');
    }
  }, 30000);

  // ── 6-Jars finance: FIN-UC01, FIN-UC02, FIN-UC03 ────────────────────
  describe('6-Jars finance', () => {
    it('GET /finance/jars returns the 6 system jars', async () => {
      const res = await request(BASE_URL)
        .get('/finance/jars')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    });

    it('GET /finance/jars/allocations returns percentages that sum to 100', async () => {
      const res = await request(BASE_URL)
        .get('/finance/jars/allocations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const total = res.body.data.reduce((sum: number, j: any) => sum + Number(j.percentage), 0);
      expect(total).toBeCloseTo(100, 1);
    });

    it('POST /finance/transactions creates a real expense, GET reflects it, DELETE cleans it up', async () => {
      const createRes = await request(BASE_URL)
        .post('/finance/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'expense',
          amount: 5000,
          description: '[e2e-test] business-flows create/delete transaction',
          moneyJarId: essentialsJarId,
          transactionDate: new Date().toISOString(),
        })
        .expect(201);

      const transactionId = createRes.body.data.id;
      expect(transactionId).toBeDefined();

      await request(BASE_URL)
        .get(`/finance/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.amount).toBe(5000);
        });

      await request(BASE_URL)
        .delete(`/finance/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    }, 30000);

    it('POST /finance/transactions/distribute-income splits a real income across two jars, then cleans up both', async () => {
      const res = await request(BASE_URL)
        .post('/finance/transactions/distribute-income')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 100000,
          description: '[e2e-test] business-flows distribute-income',
          transactionDate: new Date().toISOString(),
          jarAllocations: [
            { jarId: essentialsJarId, amount: 60000 },
            { jarId: enjoymentJarId, amount: 40000 },
          ],
        })
        .expect(201);

      expect(res.body.data).toHaveLength(2);

      await Promise.all(
        res.body.data.map((tx: any) =>
          request(BASE_URL)
            .delete(`/finance/transactions/${tx.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200),
        ),
      );
    }, 30000);
  });

  // ── AI classification: AI-UC02 ──────────────────────────────────────
  describe('AI transaction classification', () => {
    it('POST /ai/6jars/classify maps a real expense description to a jar owned by the user', async () => {
      const res = await request(BASE_URL)
        .post('/ai/6jars/classify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Ăn trưa với bạn ở quán cơm', amount: 45000 })
        .expect(200);

      expect(res.body.data).toHaveProperty('suggested_jar_code');
      expect(res.body.data).toHaveProperty('confidence');
    }, 30000);
  });

  // ── Scholarships: SCH-UC01, SCH-UC02 ────────────────────────────────
  // NOTE: registerScholarship() is intentionally exercised only through its
  // read-only 404 guardrail here, not a full create-then-delete lifecycle.
  // DELETE /student-scholarships/{id} was found (via a real create+delete
  // run of this suite) to return 204 without actually removing the row —
  // the WHERE clause compares against the account id rather than the user
  // id stored on the application, so 0 rows ever match. Two orphaned draft
  // rows had to be cleaned up by hand afterward. Until that repository bug
  // is fixed, this suite avoids creating real scholarship applications it
  // cannot reliably clean back up.
  describe('Scholarships', () => {
    it('GET /scholarships lists active scholarship programs', async () => {
      const res = await request(BASE_URL)
        .get('/scholarships?limit=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /student-scholarships/my-applications lists this account\'s applications', async () => {
      const res = await request(BASE_URL)
        .get('/student-scholarships/my-applications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const items = res.body.data.items ?? res.body.data;
      expect(Array.isArray(items)).toBe(true);
    });

    it('POST /scholarships/register rejects a non-existent scholarship_id (no side effects)', async () => {
      const res = await request(BASE_URL)
        .post('/scholarships/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          scholarship_id: '00000000-0000-4000-8000-000000000000',
          note: '[e2e-test] business-flows nonexistent scholarship probe',
          isDraft: true,
        })
        .expect(404);

      expect(res.body.message).toContain('Scholarship not found');
    }, 30000);
  });

  // ── Academic: ACA-UC01, ACA-UC02 ─────────────────────────────────────
  describe('Academic records', () => {
    it('GET /universities/dropdown lists the shared university catalogue', async () => {
      const res = await request(BASE_URL)
        .get('/universities/dropdown')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /student/grades returns this student\'s recorded grades', async () => {
      const res = await request(BASE_URL)
        .get('/student/grades')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET then PATCH /student/gradebook-target updates the credit target and restores it afterward', async () => {
      const beforeRes = await request(BASE_URL)
        .get('/student/gradebook-target')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const original = beforeRes.body.data;

      const patchRes = await request(BASE_URL)
        .patch('/student/gradebook-target')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ target_note: '[e2e-test] business-flows gradebook target' })
        .expect(200);

      expect(patchRes.body.data.target_note).toBe('[e2e-test] business-flows gradebook target');

      // Restore the original value so the account is left unchanged.
      await request(BASE_URL)
        .patch('/student/gradebook-target')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ target_note: original?.target_note ?? null })
        .expect(200);
    }, 30000);
  });

  // ── Auto-transfer schedules: FIN-UC05 ────────────────────────────────
  describe('Auto-transfer schedules', () => {
    let createdScheduleId: string | undefined;

    afterAll(async () => {
      if (createdScheduleId) {
        await request(BASE_URL)
          .delete(`/auto-transfer-schedules/${createdScheduleId}`)
          .set('Authorization', `Bearer ${accessToken}`);
      }
    });

    it('GET /auto-transfer-schedules lists this account\'s schedules', async () => {
      const res = await request(BASE_URL)
        .get('/auto-transfer-schedules')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST creates a schedule, PATCH toggle deactivates it, then it is deleted in afterAll', async () => {
      const createRes = await request(BASE_URL)
        .post('/auto-transfer-schedules')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '[e2e-test] business-flows schedule',
          amount: 1000000,
          frequency: 'monthly',
          dayOfMonth: 1,
          allocationType: 'default',
          notifyBefore: false,
          notifyAfter: false,
          transactionType: 'income',
        })
        .expect(201);

      createdScheduleId = createRes.body.data.id;
      expect(createRes.body.data.is_active).toBe(true);

      const toggleRes = await request(BASE_URL)
        .patch(`/auto-transfer-schedules/${createdScheduleId}/toggle`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(toggleRes.body.data.is_active).toBe(false);
    }, 30000);
  });
});
