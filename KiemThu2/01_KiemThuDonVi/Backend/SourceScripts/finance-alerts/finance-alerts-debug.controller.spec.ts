import { FinanceAlertsDebugController } from './finance-alerts-debug.controller';

describe('FinanceAlertsDebugController', () => {
  let controller: FinanceAlertsDebugController;

  const financeNotificationService = {
    checkJarThresholdNotifications: jest.fn(),
    checkBudgetNotifications: jest.fn(),
    checkExpiringSchedules: jest.fn(),
    sendMonthlyFinanceReport: jest.fn(),
    sendTransactionReminder: jest.fn(),
    notifyAnomalyAlert: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FinanceAlertsDebugController(financeNotificationService as any);
  });

  it('testJarThreshold triggers the jar threshold check with body defaults applied', async () => {
    financeNotificationService.checkJarThresholdNotifications.mockResolvedValue(undefined);

    const result = await controller.testJarThreshold('user-1', 'jar-1', {} as any);

    expect(financeNotificationService.checkJarThresholdNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Test Jar',
      'test',
    );
    expect(result).toEqual({ message: 'Jar threshold check triggered — see notification queue' });
  });

  it('testJarThreshold forwards jarName/jarCode from the body when provided', async () => {
    financeNotificationService.checkJarThresholdNotifications.mockResolvedValue(undefined);

    await controller.testJarThreshold('user-1', 'jar-1', { jarName: 'Thiết yếu', jarCode: 'essentials' });

    expect(financeNotificationService.checkJarThresholdNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Thiết yếu',
      'essentials',
    );
  });

  it('testBudget triggers the budget check with body defaults applied', async () => {
    financeNotificationService.checkBudgetNotifications.mockResolvedValue(undefined);

    const result = await controller.testBudget('user-1', 'jar-1', {} as any);

    expect(financeNotificationService.checkBudgetNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Test Jar',
      'test',
    );
    expect(result).toEqual({ message: 'Budget check triggered — see notification queue' });
  });

  it('testExpiringSchedules triggers the expiring-schedules check', async () => {
    financeNotificationService.checkExpiringSchedules.mockResolvedValue(undefined);

    const result = await controller.testExpiringSchedules();

    expect(financeNotificationService.checkExpiringSchedules).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Expiring schedule check triggered' });
  });

  it('testMonthlyReport triggers the monthly finance report', async () => {
    financeNotificationService.sendMonthlyFinanceReport.mockResolvedValue(undefined);

    const result = await controller.testMonthlyReport();

    expect(financeNotificationService.sendMonthlyFinanceReport).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Monthly finance report triggered' });
  });

  it('testTransactionReminder triggers the transaction reminder', async () => {
    financeNotificationService.sendTransactionReminder.mockResolvedValue(undefined);

    const result = await controller.testTransactionReminder();

    expect(financeNotificationService.sendTransactionReminder).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Transaction reminder triggered' });
  });

  it('testAnomalyAlert triggers the anomaly alert with body defaults applied', async () => {
    financeNotificationService.notifyAnomalyAlert.mockResolvedValue(undefined);

    const result = await controller.testAnomalyAlert('user-1', {} as any);

    expect(financeNotificationService.notifyAnomalyAlert).toHaveBeenCalledWith(
      'user-1',
      'spike_expense',
      'Chi tiêu tháng này tăng 50% so với tháng trước',
    );
    expect(result).toEqual({ message: "Anomaly alert 'undefined' triggered" });
  });

  it('testAnomalyAlert forwards alertType/description from the body when provided', async () => {
    financeNotificationService.notifyAnomalyAlert.mockResolvedValue(undefined);

    const result = await controller.testAnomalyAlert('user-1', {
      alertType: 'unusual_transfer',
      description: 'Chuyển khoản bất thường',
    });

    expect(financeNotificationService.notifyAnomalyAlert).toHaveBeenCalledWith(
      'user-1',
      'unusual_transfer',
      'Chuyển khoản bất thường',
    );
    expect(result).toEqual({ message: "Anomaly alert 'unusual_transfer' triggered" });
  });
});
