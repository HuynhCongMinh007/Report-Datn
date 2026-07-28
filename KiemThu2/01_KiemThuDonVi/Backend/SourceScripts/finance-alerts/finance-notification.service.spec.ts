import { FinanceNotificationService } from './finance-notification.service';

// Chainable stub for `.createQueryBuilder().update()...set()...where()...andWhere()...execute()`
// used by the amount/budget alert-claim helpers (tryClaimAmountAlert, releaseAmountAlert,
// releaseBudgetAlertLevel). `execute` always resolves — none of the tests below assert on the
// affected-row count of these queries, only on whether `createNewJob` was called.
function makeQueryBuilderMock() {
  const qb: Record<string, jest.Mock> = {};
  ['update', 'set', 'where', 'andWhere'].forEach(method => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return qb;
}

// Chainable stub for the SELECT-style query builders used by the cron notification
// methods (checkExpiringSchedules, sendMonthlyFinanceReport, sendWeeklySpendingDigest,
// sendTransactionReminder, getAccountIdsByUserIds).
function makeSelectQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'distinct', 'groupBy', 'addGroupBy'].forEach(
    (method) => {
      qb[method] = jest.fn().mockReturnValue(qb);
    },
  );
  qb.getRawMany = jest.fn().mockResolvedValue(overrides.getRawMany ?? []);
  qb.getRawAndEntities = jest.fn().mockResolvedValue(
    overrides.getRawAndEntities ?? { entities: [], raw: [] },
  );
  return qb;
}

describe('FinanceNotificationService (FIN-UC04 — ngưỡng cảnh báo chi tiêu theo hũ)', () => {
  let service: FinanceNotificationService;

  const notifSettingRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const budgetRepo = {
    findOne: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const jarRepo = { findOne: jest.fn(), find: jest.fn() };
  const scheduleRepo = { createQueryBuilder: jest.fn() };
  const txRepo = { createQueryBuilder: jest.fn() };
  const userRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

  const notificationQueueService = { createNewJob: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceNotificationService(
      notifSettingRepo as any,
      budgetRepo as any,
      jarRepo as any,
      scheduleRepo as any,
      txRepo as any,
      userRepo as any,
      notificationQueueService as any,
    );
    userRepo.findOne.mockResolvedValue({ id: 'user-1', account: { accountId: 'acc-1' } });
    // tryClaimAmountAlert/releaseAmountAlert and releaseBudgetAlertLevel go through
    // createQueryBuilder(); tryClaimBudgetAlertLevel goes through the raw `query()` escape
    // hatch. Default both to "claim succeeded" so existing alert-sending tests keep passing;
    // only the dedup-specific tests below need to override this to `false`.
    notifSettingRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock());
    budgetRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock());
    budgetRepo.query.mockResolvedValue([[{ id: 'budget-1' }], 1]);
  });

  describe('checkJarThresholdNotifications', () => {
    it('does nothing when the user has no notification setting configured', async () => {
      notifSettingRepo.findOne.mockResolvedValue(null);

      await service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('sends an amount-threshold alert when jar balance drops to or below the configured amount', async () => {
      notifSettingRepo.findOne.mockResolvedValue({
        amountEnabled: true,
        amountValue: 100000,
        percentEnabled: false,
      });
      jarRepo.findOne.mockResolvedValue({ id: 'jar-1', currentBalance: 50000 });

      await service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'] }),
      );
    });

    it('does not alert when the jar balance is still above the configured amount', async () => {
      notifSettingRepo.findOne.mockResolvedValue({
        amountEnabled: true,
        amountValue: 100000,
        percentEnabled: false,
      });
      jarRepo.findOne.mockResolvedValue({ id: 'jar-1', currentBalance: 500000 });

      await service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('releases the amount alert once the jar balance recovers above the configured amount', async () => {
      const releaseQb = makeQueryBuilderMock();
      notifSettingRepo.createQueryBuilder.mockReturnValue(releaseQb);
      notifSettingRepo.findOne.mockResolvedValue({
        id: 'setting-1',
        amountEnabled: true,
        amountValue: 100000,
        amountAlertActive: true,
        percentEnabled: false,
      });
      jarRepo.findOne.mockResolvedValue({ id: 'jar-1', currentBalance: 500000 });

      await service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(releaseQb.set).toHaveBeenCalledWith({ amountAlertActive: false });
      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('sends a percent-threshold alert when spent ratio reaches the configured budget percentage', async () => {
      notifSettingRepo.findOne.mockResolvedValue({
        amountEnabled: false,
        percentEnabled: true,
        percentValue: 80,
      });
      budgetRepo.findOne.mockResolvedValue({ spentAmount: 900000, amount: 1000000 });

      await service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'] }),
      );
    });

    it('swallows repository errors instead of throwing (never blocks the transaction flow)', async () => {
      notifSettingRepo.findOne.mockRejectedValue(new Error('db down'));

      await expect(
        service.checkJarThresholdNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials'),
      ).resolves.toBeUndefined();
    });
  });

  describe('checkBudgetNotifications', () => {
    it('does nothing when there is no active budget for the jar', async () => {
      budgetRepo.findOne.mockResolvedValue(null);

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('alerts that the budget is fully depleted when remaining amount is zero', async () => {
      budgetRepo.findOne.mockResolvedValue({ remainingAmount: 0, amount: 1000000 });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('đã hết ngân sách') }),
      );
    });

    it('alerts that the budget is nearly depleted when remaining is at or below 10%', async () => {
      budgetRepo.findOne.mockResolvedValue({ remainingAmount: 50000, amount: 1000000 });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('sắp hết ngân sách') }),
      );
    });

    it('does not alert when remaining budget is comfortably above 10%', async () => {
      budgetRepo.findOne.mockResolvedValue({ remainingAmount: 500000, amount: 1000000 });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does not send a duplicate alert when another caller already claimed the alert level this period', async () => {
      // tryClaimBudgetAlertLevel's raw UPDATE...RETURNING query resolves with an empty
      // rows array when the WHERE clause matched nothing (already claimed for this period).
      budgetRepo.query.mockResolvedValue([[], 0]);
      budgetRepo.findOne.mockResolvedValue({ id: 'budget-1', remainingAmount: 0, amount: 1000000, periodStart: new Date('2026-07-01') });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does not send a duplicate near-exhausted alert when the claim is already held', async () => {
      budgetRepo.query.mockResolvedValue([[], 0]);
      budgetRepo.findOne.mockResolvedValue({ id: 'budget-1', remainingAmount: 50000, amount: 1000000, periodStart: new Date('2026-07-01') });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does not alert and does not touch total when total is zero or negative', async () => {
      budgetRepo.findOne.mockResolvedValue({ id: 'budget-1', remainingAmount: 0, amount: 0 });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
      expect(budgetRepo.query).not.toHaveBeenCalled();
    });

    it('resets budgetAlertLevel back to none once spending recovers to a healthy level', async () => {
      const releaseQb = makeQueryBuilderMock();
      budgetRepo.createQueryBuilder.mockReturnValue(releaseQb);
      budgetRepo.findOne.mockResolvedValue({
        id: 'budget-1',
        remainingAmount: 500000,
        amount: 1000000,
        budgetAlertLevel: 'near_exhausted',
      });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(releaseQb.set).toHaveBeenCalledWith({ budgetAlertLevel: 'none', budgetAlertPeriodStart: null });
      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does not touch budgetAlertLevel when it is already none and spending is healthy', async () => {
      const releaseQb = makeQueryBuilderMock();
      budgetRepo.createQueryBuilder.mockReturnValue(releaseQb);
      budgetRepo.findOne.mockResolvedValue({
        id: 'budget-1',
        remainingAmount: 500000,
        amount: 1000000,
        budgetAlertLevel: 'none',
      });

      await service.checkBudgetNotifications('jar-1', 'user-1', 'Thiết yếu', 'essentials');

      expect(releaseQb.set).not.toHaveBeenCalled();
    });
  });

  describe('notifyAutoTransferUpcoming (FIN-UC05 — nhắc trước khi lịch chạy)', () => {
    const makeSchedule = (overrides: Record<string, any> = {}) => ({
      id: 'sched-1',
      userId: 'user-1',
      name: 'Lương hàng tháng',
      amount: 5000000,
      notifyBefore: true,
      nextRunDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      ...overrides,
    });

    it('does nothing when the schedule owner opted out of the upcoming-transfer reminder', async () => {
      await service.notifyAutoTransferUpcoming(makeSchedule({ notifyBefore: false }) as any);

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does nothing once the scheduled run date has already passed', async () => {
      await service.notifyAutoTransferUpcoming(
        makeSchedule({ nextRunDate: new Date(Date.now() - 60 * 1000) }) as any,
      );

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('schedules a reminder notification one day before the run date', async () => {
      await service.notifyAutoTransferUpcoming(makeSchedule() as any);

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'], dateSend: expect.any(Date) }),
      );
    });

    it('sends the reminder immediately when the run date is less than a day away', async () => {
      await service.notifyAutoTransferUpcoming(
        makeSchedule({ nextRunDate: new Date(Date.now() + 60 * 60 * 1000) }) as any,
      );

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.not.objectContaining({ dateSend: expect.anything() }),
      );
    });

    it('logs but does not throw when the user has no linked account', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', account: null });

      await expect(service.notifyAutoTransferUpcoming(makeSchedule() as any)).resolves.toBeUndefined();
      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('logs but does not throw when the notification queue call fails', async () => {
      notificationQueueService.createNewJob.mockRejectedValueOnce(new Error('queue down'));

      await expect(service.notifyAutoTransferUpcoming(makeSchedule() as any)).resolves.toBeUndefined();
    });
  });

  describe('notifyAutoTransferSuccess / notifyAutoTransferFailed (kết quả thực thi lịch)', () => {
    const makeSchedule = (overrides: Record<string, any> = {}) => ({
      id: 'sched-1',
      userId: 'user-1',
      name: 'Lương hàng tháng',
      amount: 5000000,
      notifyAfter: true,
      ...overrides,
    });

    it('does nothing when the owner opted out of after-run notifications', async () => {
      await service.notifyAutoTransferSuccess(makeSchedule({ notifyAfter: false }) as any);
      await service.notifyAutoTransferFailed(makeSchedule({ notifyAfter: false }) as any);

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('notifies the student when the scheduled transfer succeeds', async () => {
      await service.notifyAutoTransferSuccess(makeSchedule() as any);

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Chuyển tiền tự động thành công' }),
      );
    });

    it('notifies the student when the scheduled transfer fails', async () => {
      await service.notifyAutoTransferFailed(makeSchedule() as any);

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lịch chuyển tiền thất bại' }),
      );
    });

    it('notifyAutoTransferSuccess logs but does not throw when the notification queue call fails', async () => {
      notificationQueueService.createNewJob.mockRejectedValueOnce(new Error('queue down'));

      await expect(service.notifyAutoTransferSuccess(makeSchedule() as any)).resolves.toBeUndefined();
    });

    it('notifyAutoTransferFailed logs but does not throw when the notification queue call fails', async () => {
      notificationQueueService.createNewJob.mockRejectedValueOnce(new Error('queue down'));

      await expect(service.notifyAutoTransferFailed(makeSchedule() as any)).resolves.toBeUndefined();
    });
  });

  describe('notifyAnomalyAlert (AI-UC02 phụ trợ — cảnh báo chi tiêu bất thường)', () => {
    it('sends a spike-expense alert for a detected spending spike', async () => {
      await service.notifyAnomalyAlert('user-1', 'spike_expense', 'Chi tiêu tăng đột biến 300%');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Phát hiện chi tiêu bất thường' }),
      );
    });

    it('sends a budget-exceeded alert for a near-threshold anomaly', async () => {
      await service.notifyAnomalyAlert('user-1', 'budget_exceeded', 'Đã vượt 95% ngân sách tháng');

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Vượt ngân sách tháng này' }),
      );
    });

    it('ignores unrecognized alert types', async () => {
      await service.notifyAnomalyAlert('user-1', 'unknown_type', 'N/A');

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('logs but does not throw when the notification queue call fails', async () => {
      notificationQueueService.createNewJob.mockRejectedValueOnce(new Error('queue down'));

      await expect(
        service.notifyAnomalyAlert('user-1', 'spike_expense', 'Chi tiêu tăng đột biến'),
      ).resolves.toBeUndefined();
    });
  });

  describe('checkExpiringSchedules (cron: lịch chuyển tiền sắp hết hạn)', () => {
    it('notifies the owner of each schedule expiring within 3 days', async () => {
      scheduleRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({
          getRawAndEntities: {
            entities: [{ id: 'sched-1', name: 'Lương hàng tháng', endDate: new Date('2026-07-30') }],
            raw: [{ accountId: 'acc-1' }],
          },
        }),
      );

      await service.checkExpiringSchedules();

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'], title: 'Lịch chuyển tiền sắp kết thúc' }),
      );
    });

    it('skips a schedule whose owner has no linked account', async () => {
      scheduleRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({
          getRawAndEntities: {
            entities: [{ id: 'sched-1', name: 'Lương hàng tháng', endDate: new Date('2026-07-30') }],
            raw: [{ accountId: undefined }],
          },
        }),
      );

      await service.checkExpiringSchedules();

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('does nothing when there are no expiring schedules', async () => {
      scheduleRepo.createQueryBuilder.mockReturnValue(makeSelectQueryBuilderMock());

      await service.checkExpiringSchedules();

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('swallows a query error without throwing', async () => {
      scheduleRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });

      await expect(service.checkExpiringSchedules()).resolves.toBeUndefined();
    });
  });

  describe('sendMonthlyFinanceReport (cron: báo cáo tài chính cuối tháng)', () => {
    it('sends a report notification to every user with activity last month', async () => {
      txRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }),
      );
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1', accountId: 'acc-1' }] }),
      );

      await service.sendMonthlyFinanceReport();

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'] }),
      );
    });

    it('skips users with no linked account', async () => {
      txRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }),
      );
      userRepo.createQueryBuilder.mockReturnValue(makeSelectQueryBuilderMock({ getRawMany: [] }));

      await service.sendMonthlyFinanceReport();

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('swallows a query error without throwing', async () => {
      txRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });

      await expect(service.sendMonthlyFinanceReport()).resolves.toBeUndefined();
    });
  });

  describe('sendWeeklySpendingDigest (B1 — tóm tắt chi tiêu tuần)', () => {
    it('does nothing when there are no transactions in the last 7 days', async () => {
      txRepo.createQueryBuilder.mockReturnValue(makeSelectQueryBuilderMock({ getRawMany: [] }));

      await service.sendWeeklySpendingDigest();

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('sends an income/expense summary highlighting the top-spending jar', async () => {
      txRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({
          getRawMany: [
            { userId: 'user-1', type: 'income', moneyJarId: null, total: '2000000' },
            { userId: 'user-1', type: 'expense', moneyJarId: 'jar-1', total: '500000' },
            { userId: 'user-1', type: 'expense', moneyJarId: 'jar-2', total: '1200000' },
          ],
        }),
      );
      jarRepo.find.mockResolvedValue([
        { id: 'jar-1', name: 'Thiết yếu' },
        { id: 'jar-2', name: 'Giải trí' },
      ]);
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1', accountId: 'acc-1' }] }),
      );

      await service.sendWeeklySpendingDigest();

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIds: ['acc-1'],
          body: expect.stringContaining('Giải trí'),
        }),
      );
    });

    it('swallows a query error without throwing', async () => {
      txRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });

      await expect(service.sendWeeklySpendingDigest()).resolves.toBeUndefined();
    });
  });

  describe('sendTransactionReminder (cron: nhắc chưa nhập giao dịch)', () => {
    it('notifies users who have transaction history but nothing in the last 7 days', async () => {
      txRepo.createQueryBuilder
        .mockReturnValueOnce(makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }, { userId: 'user-2' }] }))
        .mockReturnValueOnce(makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));
      userRepo.createQueryBuilder.mockReturnValue(
        makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-2', accountId: 'acc-2' }] }),
      );

      await service.sendTransactionReminder();

      expect(notificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-2'] }),
      );
      expect(notificationQueueService.createNewJob).toHaveBeenCalledTimes(1);
    });

    it('does not notify users who transacted within the last 7 days', async () => {
      txRepo.createQueryBuilder
        .mockReturnValueOnce(makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }))
        .mockReturnValueOnce(makeSelectQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));

      await service.sendTransactionReminder();

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('swallows a query error without throwing', async () => {
      txRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });

      await expect(service.sendTransactionReminder()).resolves.toBeUndefined();
    });
  });
});
