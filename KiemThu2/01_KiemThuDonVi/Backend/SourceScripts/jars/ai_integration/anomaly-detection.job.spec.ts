import { AnomalyDetectionJob } from './anomaly-detection.job';
import { AiAlertType, AiModuleType } from '@/database/entities';

// Chainable stub covering the subset of SelectQueryBuilder methods used by this job:
// select/addSelect/where/andWhere/distinct, terminated by either getRawMany, getRawOne or getMany.
function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['select', 'addSelect', 'where', 'andWhere', 'distinct'].forEach((method) => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.getRawMany = jest.fn().mockResolvedValue(overrides.getRawMany ?? []);
  qb.getRawOne = jest.fn().mockResolvedValue(overrides.getRawOne ?? { total: '0', count: '0' });
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  return qb;
}

describe('AnomalyDetectionJob', () => {
  let job: AnomalyDetectionJob;

  const jarRepo = { createQueryBuilder: jest.fn() };
  const txRepo = { createQueryBuilder: jest.fn() };
  const alertRepo = { findOne: jest.fn() };
  const aiService = { saveAnomalyAlert: jest.fn() };
  const financeNotificationService = { notifyAnomalyAlert: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    financeNotificationService.notifyAnomalyAlert.mockResolvedValue(undefined);
    job = new AnomalyDetectionJob(
      jarRepo as any,
      txRepo as any,
      alertRepo as any,
      aiService as any,
      financeNotificationService as any,
    );
  });

  const flushMicrotasks = () => new Promise((resolve) => process.nextTick(resolve));

  it('does nothing further when there are no users with active jars', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getRawMany: [] }));

    await job.handleAnomalyDetection();

    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('skips entries with a falsy userId', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilderMock({ getRawMany: [{ userId: null }, { userId: undefined }] }),
    );

    await job.handleAnomalyDetection();

    expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not query for anomalous transactions when the user has no spending history', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));
    const txQb = makeQueryBuilderMock({ getRawOne: { total: '0', count: '0' } });
    txRepo.createQueryBuilder.mockReturnValue(txQb);

    await job.handleAnomalyDetection();

    expect(txQb.getMany).not.toHaveBeenCalled();
  });

  it('creates and pushes an alert for a transaction exceeding the anomaly threshold', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));
    const txQb = makeQueryBuilderMock({
      getRawOne: { total: '1000000', count: '10' }, // avg 100k/tx, threshold 250k
      getMany: [{ id: 'tx-1', amount: '500000', description: 'iPhone case' }],
    });
    txRepo.createQueryBuilder.mockReturnValue(txQb);
    alertRepo.findOne.mockResolvedValue(null);
    aiService.saveAnomalyAlert.mockResolvedValue(undefined);

    await job.handleAnomalyDetection();
    await flushMicrotasks();

    expect(alertRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'user-1', targetId: 'tx-1' } });
    expect(aiService.saveAnomalyAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        moduleType: AiModuleType.SIX_JARS,
        alertType: AiAlertType.SPIKE_EXPENSE,
        targetId: 'tx-1',
      }),
    );
    expect(financeNotificationService.notifyAnomalyAlert).toHaveBeenCalledWith(
      'user-1',
      AiAlertType.SPIKE_EXPENSE,
      expect.stringContaining('iPhone case'),
    );
  });

  it('does not create a duplicate alert when one already exists for the transaction', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));
    const txQb = makeQueryBuilderMock({
      getRawOne: { total: '1000000', count: '10' },
      getMany: [{ id: 'tx-1', amount: '500000', description: 'iPhone case' }],
    });
    txRepo.createQueryBuilder.mockReturnValue(txQb);
    alertRepo.findOne.mockResolvedValue({ id: 'alert-existing' });

    await job.handleAnomalyDetection();

    expect(aiService.saveAnomalyAlert).not.toHaveBeenCalled();
    expect(financeNotificationService.notifyAnomalyAlert).not.toHaveBeenCalled();
  });

  it('continues processing remaining users when analyzing one user throws', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }, { userId: 'user-2' }] }),
    );
    txRepo.createQueryBuilder
      .mockImplementationOnce(() => {
        throw new Error('db error for user-1');
      })
      .mockImplementationOnce(() => makeQueryBuilderMock({ getRawOne: { total: '0', count: '0' } }));

    await expect(job.handleAnomalyDetection()).resolves.toBeUndefined();

    expect(txRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('does not crash when the fire-and-forget push notification rejects', async () => {
    jarRepo.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getRawMany: [{ userId: 'user-1' }] }));
    const txQb = makeQueryBuilderMock({
      getRawOne: { total: '1000000', count: '10' },
      getMany: [{ id: 'tx-1', amount: '500000', description: 'iPhone case' }],
    });
    txRepo.createQueryBuilder.mockReturnValue(txQb);
    alertRepo.findOne.mockResolvedValue(null);
    aiService.saveAnomalyAlert.mockResolvedValue(undefined);
    financeNotificationService.notifyAnomalyAlert.mockRejectedValue(new Error('push failed'));

    await expect(job.handleAnomalyDetection()).resolves.toBeUndefined();
    await flushMicrotasks();
  });
});
