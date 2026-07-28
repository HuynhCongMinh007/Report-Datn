import { AutoTransferQueueService } from './auto-transfer-queue.service';
import {
  AUTO_TRANSFER_REMINDER_JOB,
  AUTO_TRANSFER_TRANSFER_JOB,
} from './constants/auto-transfer-schedules.constant';

describe('AutoTransferQueueService', () => {
  let service: AutoTransferQueueService;

  const autoTransferQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };
  const schedulesRepository = {
    findActiveSchedules: jest.fn(),
    updateQueueJobIds: jest.fn(),
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const makeSchedule = (overrides: Record<string, any> = {}) => ({
    id: 'schedule-1',
    isActive: true,
    notifyBefore: true,
    nextRunDate: new Date(Date.now() + 5 * ONE_DAY_MS),
    endDate: null,
    transferJobId: null,
    reminderJobId: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    autoTransferQueue.add.mockResolvedValue(undefined);
    schedulesRepository.updateQueueJobIds.mockResolvedValue(undefined);
    service = new AutoTransferQueueService(autoTransferQueue as any, schedulesRepository as any);
  });

  describe('reschedule', () => {
    it('schedules both a transfer job and a reminder job for an active, non-expired schedule', async () => {
      const schedule = makeSchedule();

      await service.reschedule(schedule as any);

      expect(autoTransferQueue.add).toHaveBeenCalledWith(
        AUTO_TRANSFER_TRANSFER_JOB,
        { scheduleId: 'schedule-1' },
        expect.objectContaining({
          jobId: `auto-transfer_schedule-1_${schedule.nextRunDate.getTime()}`,
        }),
      );
      expect(autoTransferQueue.add).toHaveBeenCalledWith(
        AUTO_TRANSFER_REMINDER_JOB,
        { scheduleId: 'schedule-1' },
        expect.objectContaining({
          jobId: `auto-transfer-reminder_schedule-1_${schedule.nextRunDate.getTime()}`,
        }),
      );
      expect(schedulesRepository.updateQueueJobIds).toHaveBeenCalledWith('schedule-1', {
        transferJobId: `auto-transfer_schedule-1_${schedule.nextRunDate.getTime()}`,
        reminderJobId: `auto-transfer-reminder_schedule-1_${schedule.nextRunDate.getTime()}`,
      });
    });

    it('does not schedule a reminder job when notifyBefore is false', async () => {
      const schedule = makeSchedule({ notifyBefore: false });

      await service.reschedule(schedule as any);

      expect(autoTransferQueue.add).toHaveBeenCalledTimes(1);
      expect(autoTransferQueue.add).toHaveBeenCalledWith(
        AUTO_TRANSFER_TRANSFER_JOB,
        expect.anything(),
        expect.anything(),
      );
      expect(schedulesRepository.updateQueueJobIds).toHaveBeenCalledWith(
        'schedule-1',
        expect.objectContaining({ reminderJobId: null }),
      );
    });

    it('does not schedule a reminder job when the reminder date has already passed', async () => {
      // nextRunDate less than 1 day away means (nextRunDate - 1 day) is already in the past
      const schedule = makeSchedule({ nextRunDate: new Date(Date.now() + 1000) });

      await service.reschedule(schedule as any);

      expect(autoTransferQueue.add).toHaveBeenCalledTimes(1);
    });

    it('cancels queued jobs and clears job ids without scheduling when the schedule is inactive', async () => {
      const schedule = makeSchedule({
        isActive: false,
        transferJobId: 'old-transfer-job',
        reminderJobId: 'old-reminder-job',
      });
      autoTransferQueue.getJob.mockResolvedValue(null);

      await service.reschedule(schedule as any);

      expect(autoTransferQueue.add).not.toHaveBeenCalled();
      expect(schedulesRepository.updateQueueJobIds).toHaveBeenCalledWith('schedule-1', {
        transferJobId: null,
        reminderJobId: null,
      });
    });

    it('cancels queued jobs and clears job ids without scheduling when the schedule has expired', async () => {
      const schedule = makeSchedule({
        endDate: new Date(Date.now() - ONE_DAY_MS),
      });
      autoTransferQueue.getJob.mockResolvedValue(null);

      await service.reschedule(schedule as any);

      expect(autoTransferQueue.add).not.toHaveBeenCalled();
      expect(schedulesRepository.updateQueueJobIds).toHaveBeenCalledWith('schedule-1', {
        transferJobId: null,
        reminderJobId: null,
      });
    });
  });

  describe('cancelScheduledJobs', () => {
    it('removes both jobs when neither is in the skip list', async () => {
      const job = { remove: jest.fn().mockResolvedValue(undefined) };
      autoTransferQueue.getJob.mockResolvedValue(job);
      const schedule = makeSchedule({ transferJobId: 'job-a', reminderJobId: 'job-b' });

      await service.cancelScheduledJobs(schedule as any);

      expect(autoTransferQueue.getJob).toHaveBeenCalledWith('job-a');
      expect(autoTransferQueue.getJob).toHaveBeenCalledWith('job-b');
      expect(job.remove).toHaveBeenCalledTimes(2);
    });

    it('skips removing a job whose id is in the skip list', async () => {
      const job = { remove: jest.fn().mockResolvedValue(undefined) };
      autoTransferQueue.getJob.mockResolvedValue(job);
      const schedule = makeSchedule({ transferJobId: 'job-a', reminderJobId: 'job-b' });

      await service.cancelScheduledJobs(schedule as any, ['job-a']);

      expect(autoTransferQueue.getJob).not.toHaveBeenCalledWith('job-a');
      expect(autoTransferQueue.getJob).toHaveBeenCalledWith('job-b');
    });

    it('does nothing when the schedule has no job ids set', async () => {
      const schedule = makeSchedule({ transferJobId: null, reminderJobId: null });

      await service.cancelScheduledJobs(schedule as any);

      expect(autoTransferQueue.getJob).not.toHaveBeenCalled();
    });

    it('swallows an error thrown while removing a stale job', async () => {
      const job = { remove: jest.fn().mockRejectedValue(new Error('already removed')) };
      autoTransferQueue.getJob.mockResolvedValue(job);
      const schedule = makeSchedule({ transferJobId: 'job-a', reminderJobId: null });

      await expect(service.cancelScheduledJobs(schedule as any)).resolves.toBeUndefined();
    });
  });

  describe('reconcileActiveSchedules', () => {
    it('reschedules a schedule whose stored job ids no longer match the expected ids', async () => {
      const schedule = makeSchedule({ transferJobId: 'stale-job-id', reminderJobId: 'stale-reminder-id' });
      schedulesRepository.findActiveSchedules.mockResolvedValue([schedule]);
      autoTransferQueue.getJob.mockResolvedValue(null);

      const rescheduleSpy = jest.spyOn(service, 'reschedule').mockResolvedValue(undefined);

      await service.reconcileActiveSchedules();

      expect(rescheduleSpy).toHaveBeenCalledWith(schedule);
    });

    it('does not reschedule when job ids match and the jobs still exist in the queue', async () => {
      const nextRunDate = new Date(Date.now() + 5 * ONE_DAY_MS);
      const transferJobId = `auto-transfer_schedule-1_${nextRunDate.getTime()}`;
      const reminderJobId = `auto-transfer-reminder_schedule-1_${nextRunDate.getTime()}`;
      const schedule = makeSchedule({ nextRunDate, transferJobId, reminderJobId });
      schedulesRepository.findActiveSchedules.mockResolvedValue([schedule]);
      autoTransferQueue.getJob.mockResolvedValue({ id: 'exists' });

      const rescheduleSpy = jest.spyOn(service, 'reschedule').mockResolvedValue(undefined);

      await service.reconcileActiveSchedules();

      expect(rescheduleSpy).not.toHaveBeenCalled();
    });

    it('logs and continues when reconciling one schedule throws', async () => {
      const schedule = makeSchedule();
      schedulesRepository.findActiveSchedules.mockResolvedValue([schedule]);
      jest.spyOn(service, 'reschedule').mockRejectedValue(new Error('boom'));
      autoTransferQueue.getJob.mockResolvedValue(null);

      await expect(service.reconcileActiveSchedules()).resolves.toBeUndefined();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('triggers reconciliation of active schedules on bootstrap', async () => {
      const reconcileSpy = jest
        .spyOn(service, 'reconcileActiveSchedules')
        .mockResolvedValue(undefined);

      await service.onApplicationBootstrap();

      expect(reconcileSpy).toHaveBeenCalledTimes(1);
    });
  });
});
