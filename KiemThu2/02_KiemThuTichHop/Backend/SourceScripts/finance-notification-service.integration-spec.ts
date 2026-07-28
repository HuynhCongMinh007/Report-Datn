import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID as uuidv4 } from 'crypto';
import { FinanceNotificationService } from '@/modules/finance-alerts/finance-notification.service';
import { NotificationQueueService } from '@/modules/notification/service/notification.queue.service';
import { entities } from '@/database/entities';
import { MoneyJar } from '@/database/entities/financial/money-jar.entity';
import { JarNotificationSetting } from '@/database/entities/financial/jar-notification-setting.entity';
import { Budget, PeriodType } from '@/database/entities/financial/budget.entity';
import { AutoTransferSchedule } from '@/database/entities/financial/auto-transfer-schedule.entity';
import { FinancialTransaction } from '@/database/entities/financial/financial-transaction.entity';
import { User } from '@/database/entities/profile/user.entity';

/**
 * Real-DB integration test for FinanceNotificationService — the atomic
 * dedup logic (`tryClaimAmountAlert`, `tryClaimBudgetAlertLevel`,
 * release*) that decides whether a jar-threshold / budget alert should fire.
 * This logic is a single conditional `UPDATE ... WHERE ...` guarded by
 * Postgres row-level locking; a mocked Repository/query-builder (as used by
 * finance-notification.service.spec.ts, the unit layer) can't exercise the
 * real SQL semantics or prove the guard actually prevents a duplicate
 * notification — only a real Postgres connection can. NotificationQueueService
 * (an external side-effect, not DB) is mocked.
 *
 * Every row this spec creates is scoped to a unique jar/budget it owns and
 * deleted in a finally block, so re-running it does not accumulate data on
 * the shared staging DB.
 */
describe('FinanceNotificationService (real DB)', () => {
  let moduleRef: INestApplicationContext;
  let service: FinanceNotificationService;
  let dataSource: DataSource;
  let jarRepo: Repository<MoneyJar>;
  let settingRepo: Repository<JarNotificationSetting>;
  let budgetRepo: Repository<Budget>;

  // users.id for account finance.seed@student360.test on the shared staging
  // DB (same account backend/.env's EVAL_USER_EMAIL live e2e suites use).
  const TEST_USER_ID = '4f0c1f80-7ab8-4ec6-8a0f-18dee0a78e34';

  const notificationQueueService = { createNewJob: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT),
          username: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
          entities,
          synchronize: false,
          ssl: process.env.DATABASE_SSL_ENABLED === 'true' ? { rejectUnauthorized: false } : false,
        }),
        TypeOrmModule.forFeature([
          MoneyJar,
          JarNotificationSetting,
          Budget,
          AutoTransferSchedule,
          FinancialTransaction,
          User,
        ]),
      ],
      providers: [
        FinanceNotificationService,
        { provide: NotificationQueueService, useValue: notificationQueueService },
      ],
    }).compile();

    service = moduleRef.get(FinanceNotificationService);
    dataSource = moduleRef.get(DataSource);
    jarRepo = moduleRef.get(getRepositoryToken(MoneyJar));
    settingRepo = moduleRef.get(getRepositoryToken(JarNotificationSetting));
    budgetRepo = moduleRef.get(getRepositoryToken(Budget));
  }, 30000);

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  async function createJar(overrides: Partial<MoneyJar> = {}): Promise<MoneyJar> {
    return jarRepo.save(
      jarRepo.create({
        id: uuidv4(),
        name: '[integration-test] jar',
        userId: TEST_USER_ID,
        isSystem: false,
        categoryType: 'other' as any,
        percentage: 0,
        currentBalance: 0,
        isDeleted: false,
        isActive: true,
        ...overrides,
      }),
    );
  }

  describe('checkJarThresholdNotifications — amount-based dedup', () => {
    it('notifies once when balance crosses at/below threshold, suppresses on repeat, releases on recovery', async () => {
      const jar = await createJar({ currentBalance: 500000 });
      const setting = await settingRepo.save(
        settingRepo.create({
          moneyJarId: jar.id,
          amountEnabled: true,
          amountValue: 1000000,
          amountAlertActive: false,
        }),
      );

      try {
        // 1st call: balance (500k) <= threshold (1M) -> claims + notifies.
        await service.checkJarThresholdNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);

        const afterFirst = await settingRepo.findOne({ where: { id: setting.id } });
        expect(afterFirst?.amountAlertActive).toBe(true);

        // 2nd call, same state: the atomic claim (WHERE amount_alert_active = false)
        // must NOT match a second time -> no duplicate notification.
        await service.checkJarThresholdNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);

        // Balance recovers above threshold -> alert is released, no new notification.
        await jarRepo.update(jar.id, { currentBalance: 2000000 as any });
        await service.checkJarThresholdNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);

        const afterRecovery = await settingRepo.findOne({ where: { id: setting.id } });
        expect(afterRecovery?.amountAlertActive).toBe(false);

        // Balance drops below threshold again -> fires a fresh notification.
        await jarRepo.update(jar.id, { currentBalance: 100000 as any });
        await service.checkJarThresholdNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(2);
      } finally {
        await settingRepo.delete({ id: setting.id });
        await jarRepo.delete({ id: jar.id });
      }
    }, 30000);

    it('does nothing when no notification setting exists for the jar', async () => {
      const jar = await createJar({ currentBalance: 0 });
      try {
        await service.checkJarThresholdNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
      } finally {
        await jarRepo.delete({ id: jar.id });
      }
    }, 30000);
  });

  describe('checkBudgetNotifications — budget_alert_level dedup', () => {
    async function createBudget(jar: MoneyJar, overrides: Partial<Budget> = {}): Promise<Budget> {
      const today = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 20);
      return budgetRepo.save(
        budgetRepo.create({
          id: uuidv4(),
          name: '[integration-test] budget',
          amount: 1000000,
          currencyCode: 'VND',
          periodType: PeriodType.MONTHLY,
          periodStart: today as any,
          periodEnd: periodEnd as any,
          spentAmount: 0,
          isActive: true,
          isTag: false,
          isDeleted: false,
          budgetAlertLevel: 'none',
          budgetAlertPeriodStart: null,
          moneyJar: { id: jar.id } as MoneyJar,
          user: { id: TEST_USER_ID } as any,
          ...overrides,
        }),
      );
    }

    it('escalates none -> near_exhausted -> exhausted, suppressing a repeat at the same level', async () => {
      const jar = await createJar();
      // remainingAmount is a stored/denormalized column (not computed from
      // amount - spentAmount by checkBudgetNotifications) -> must be set
      // explicitly to match spentAmount, same as the app does on write.
      const budget = await createBudget(jar, { spentAmount: 950000 as any, remainingAmount: 50000 as any }); // 5% left -> near_exhausted

      try {
        await service.checkBudgetNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);

        let row = await budgetRepo.findOne({ where: { id: budget.id } });
        expect(row?.budgetAlertLevel).toBe('near_exhausted');

        // Repeat call, unchanged spend -> same level, must NOT re-notify.
        await service.checkBudgetNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);

        // Spend all the way through -> exhausted is strictly more severe -> notifies again.
        await budgetRepo.update(budget.id, { spentAmount: 1000000 as any, remainingAmount: 0 as any });
        await service.checkBudgetNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(2);

        row = await budgetRepo.findOne({ where: { id: budget.id } });
        expect(row?.budgetAlertLevel).toBe('exhausted');
      } finally {
        await budgetRepo.delete({ id: budget.id });
        await jarRepo.delete({ id: jar.id });
      }
    }, 30000);

    it('releases the alert level back to none once spending recovers to a healthy level', async () => {
      const jar = await createJar();
      const budget = await createBudget(jar, {
        spentAmount: 950000 as any,
        remainingAmount: 50000 as any,
        budgetAlertLevel: 'near_exhausted',
        budgetAlertPeriodStart: new Date() as any,
      });

      try {
        // Spending recovers well under the 10% "near exhausted" line.
        await budgetRepo.update(budget.id, { spentAmount: 100000 as any, remainingAmount: 900000 as any });
        await service.checkBudgetNotifications(jar.id, TEST_USER_ID, 'Test Jar', 'essentials');
        expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();

        const row = await budgetRepo.findOne({ where: { id: budget.id } });
        expect(row?.budgetAlertLevel).toBe('none');
      } finally {
        await budgetRepo.delete({ id: budget.id });
        await jarRepo.delete({ id: jar.id });
      }
    }, 30000);
  });

  describe('notifyAnomalyAlert — real account resolution', () => {
    it('resolves the real account and sends a notification for a spike_expense alert', async () => {
      await service.notifyAnomalyAlert(TEST_USER_ID, 'spike_expense', '[integration-test] chi tiêu tăng đột biến');
      expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);
      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Phát hiện chi tiêu bất thường' }),
      );
    });

    it('does nothing for an unknown alert type', async () => {
      await service.notifyAnomalyAlert(TEST_USER_ID, 'not_a_real_alert_type', 'x');
      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does nothing when the user has no resolvable account', async () => {
      await service.notifyAnomalyAlert('00000000-0000-4000-8000-000000000000', 'spike_expense', 'x');
      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });
  });
});
