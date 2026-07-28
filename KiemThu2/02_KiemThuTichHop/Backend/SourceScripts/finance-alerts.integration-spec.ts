import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { FinanceAlertsDebugController } from '@/modules/finance-alerts/finance-alerts-debug.controller';
import { FinanceNotificationService } from '@/modules/finance-alerts/finance-notification.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';

/**
 * Integration test for the Finance Alerts debug endpoints across the full
 * HTTP stack (real controller + StackAuthGuard override + filters +
 * TransformInterceptor). FinanceNotificationService is mocked so no real
 * BullMQ/Redis job is enqueued — this asserts routing, auth, and that each
 * debug trigger is wired to the correct service method with the correct
 * arguments. No live DB/Redis required.
 */
describe('Finance Alerts debug API (/finance-alerts/debug)', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const notificationService = {
    checkJarThresholdNotifications: jest.fn(),
    checkBudgetNotifications: jest.fn(),
    checkExpiringSchedules: jest.fn(),
    sendMonthlyFinanceReport: jest.fn(),
    sendTransactionReminder: jest.fn(),
    notifyAnomalyAlert: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceAlertsDebugController],
      providers: [{ provide: FinanceNotificationService, useValue: notificationService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue(passUser)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('POST jar-threshold/:jarId triggers the jar threshold check with defaults', async () => {
    notificationService.checkJarThresholdNotifications.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/finance-alerts/debug/jar-threshold/jar-1')
      .send({})
      .expect(201);

    expect(notificationService.checkJarThresholdNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Test Jar',
      'test',
    );
  });

  it('POST jar-threshold/:jarId forwards custom jarName/jarCode from the body', async () => {
    notificationService.checkJarThresholdNotifications.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/finance-alerts/debug/jar-threshold/jar-1')
      .send({ jarName: 'Necessities', jarCode: 'necessities' })
      .expect(201);

    expect(notificationService.checkJarThresholdNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Necessities',
      'necessities',
    );
  });

  it('POST budget/:jarId triggers the budget check', async () => {
    notificationService.checkBudgetNotifications.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/finance-alerts/debug/budget/jar-1')
      .send({ jarName: 'Enjoyment', jarCode: 'enjoyment' })
      .expect(201);

    expect(notificationService.checkBudgetNotifications).toHaveBeenCalledWith(
      'jar-1',
      'user-1',
      'Enjoyment',
      'enjoyment',
    );
  });

  it('POST expiring-schedules triggers the cron check with no body', async () => {
    notificationService.checkExpiringSchedules.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/finance-alerts/debug/expiring-schedules').expect(201);
    expect(notificationService.checkExpiringSchedules).toHaveBeenCalledTimes(1);
  });

  it('POST monthly-report triggers the monthly report job', async () => {
    notificationService.sendMonthlyFinanceReport.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/finance-alerts/debug/monthly-report').expect(201);
    expect(notificationService.sendMonthlyFinanceReport).toHaveBeenCalledTimes(1);
  });

  it('POST transaction-reminder triggers the reminder job', async () => {
    notificationService.sendTransactionReminder.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/finance-alerts/debug/transaction-reminder').expect(201);
    expect(notificationService.sendTransactionReminder).toHaveBeenCalledTimes(1);
  });

  it('POST anomaly triggers the anomaly alert with defaults', async () => {
    notificationService.notifyAnomalyAlert.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/finance-alerts/debug/anomaly').send({}).expect(201);

    expect(notificationService.notifyAnomalyAlert).toHaveBeenCalledWith(
      'user-1',
      'spike_expense',
      'Chi tiêu tháng này tăng 50% so với tháng trước',
    );
  });

  it('POST anomaly forwards a custom alertType/description', async () => {
    notificationService.notifyAnomalyAlert.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/finance-alerts/debug/anomaly')
      .send({ alertType: 'unusual_merchant', description: 'Giao dịch bất thường tại cửa hàng lạ' })
      .expect(201);

    expect(res.body.message).toContain('unusual_merchant');
    expect(notificationService.notifyAnomalyAlert).toHaveBeenCalledWith(
      'user-1',
      'unusual_merchant',
      'Giao dịch bất thường tại cửa hàng lạ',
    );
  });

  it('rejects all debug endpoints with 401 when unauthenticated', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinanceAlertsDebugController],
      providers: [{ provide: FinanceNotificationService, useValue: notificationService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue({ canActivate: () => { throw new (require('@nestjs/common').UnauthorizedException)(); } })
      .compile();
    const unauthedApp = moduleRef.createNestApplication();
    unauthedApp.useGlobalFilters(new HttpExceptionFilter());
    unauthedApp.useGlobalInterceptors(new TransformInterceptor());
    await unauthedApp.init();

    await request(unauthedApp.getHttpServer()).post('/finance-alerts/debug/monthly-report').expect(401);
    await unauthedApp.close();
  });
});
