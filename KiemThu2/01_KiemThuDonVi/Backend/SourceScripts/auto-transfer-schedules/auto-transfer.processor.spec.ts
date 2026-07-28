import { AutoTransferProcessor } from './auto-transfer.processor';
import {
  AUTO_TRANSFER_REMINDER_JOB,
  AUTO_TRANSFER_TRANSFER_JOB,
} from './constants/auto-transfer-schedules.constant';

describe('AutoTransferProcessor', () => {
  let processor: AutoTransferProcessor;

  const schedulesService = {
    executeSchedule: jest.fn(),
    rescheduleScheduleJobs: jest.fn(),
  };
  const scheduleRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const financeNotificationService = {
    notifyAutoTransferSuccess: jest.fn(),
    notifyAutoTransferUpcoming: jest.fn(),
    notifyAutoTransferFailed: jest.fn(),
  };

  const makeSchedule = (overrides: Record<string, any> = {}) => ({
    id: 'schedule-1',
    nextRunDate: new Date('2026-08-01T00:00:00.000Z'),
    lastReminderRunDate: null,
    ...overrides,
  });

  // Flush the microtask queue so fire-and-forget `void promise.catch()` calls
  // (not awaited by process()) get a chance to settle before assertions run.
  const flushMicrotasks = () => new Promise((resolve) => process.nextTick(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
    financeNotificationService.notifyAutoTransferSuccess.mockResolvedValue(undefined);
    financeNotificationService.notifyAutoTransferUpcoming.mockResolvedValue(undefined);
    financeNotificationService.notifyAutoTransferFailed.mockResolvedValue(undefined);
    processor = new AutoTransferProcessor(
      schedulesService as any,
      scheduleRepo as any,
      financeNotificationService as any,
    );
  });

  it('returns early without processing when the schedule no longer exists', async () => {
    scheduleRepo.findOne.mockResolvedValue(null);

    await processor.process({
      id: 'auto-transfer_schedule-1_1000',
      name: AUTO_TRANSFER_TRANSFER_JOB,
      data: { scheduleId: 'schedule-1' },
    } as any);

    expect(schedulesService.executeSchedule).not.toHaveBeenCalled();
  });

  describe('transfer job', () => {
    it('executes the schedule, notifies success, and reschedules on happy path', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      schedulesService.executeSchedule.mockResolvedValue(undefined);
      schedulesService.rescheduleScheduleJobs.mockResolvedValue(undefined);

      const targetRunAtMs = new Date('2026-08-01T00:00:00.000Z').getTime();
      await processor.process({
        id: `auto-transfer_schedule-1_${targetRunAtMs}`,
        name: AUTO_TRANSFER_TRANSFER_JOB,
        data: { scheduleId: 'schedule-1' },
      } as any);
      await flushMicrotasks();

      expect(schedulesService.executeSchedule).toHaveBeenCalledWith(
        'schedule-1',
        new Date(targetRunAtMs),
      );
      expect(financeNotificationService.notifyAutoTransferSuccess).toHaveBeenCalledWith(schedule);
      expect(schedulesService.rescheduleScheduleJobs).toHaveBeenCalledWith('schedule-1', [
        `auto-transfer_schedule-1_${targetRunAtMs}`,
      ]);
    });

    it('parses no target run date when the job id is malformed', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      schedulesService.executeSchedule.mockResolvedValue(undefined);
      schedulesService.rescheduleScheduleJobs.mockResolvedValue(undefined);

      await processor.process({
        id: 'not-a-valid-job-id',
        name: AUTO_TRANSFER_TRANSFER_JOB,
        data: { scheduleId: 'schedule-1' },
      } as any);

      expect(schedulesService.executeSchedule).toHaveBeenCalledWith('schedule-1', undefined);
    });

    it('logs but does not crash when the fire-and-forget success notification rejects', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      schedulesService.executeSchedule.mockResolvedValue(undefined);
      schedulesService.rescheduleScheduleJobs.mockResolvedValue(undefined);
      financeNotificationService.notifyAutoTransferSuccess.mockRejectedValue(new Error('push failed'));

      await expect(
        processor.process({
          id: 'auto-transfer_schedule-1_1000',
          name: AUTO_TRANSFER_TRANSFER_JOB,
          data: { scheduleId: 'schedule-1' },
        } as any),
      ).resolves.toBeUndefined();
      await flushMicrotasks();
    });

    it('notifies failure and re-throws when executeSchedule fails', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      const error = new Error('insufficient balance');
      schedulesService.executeSchedule.mockRejectedValue(error);

      await expect(
        processor.process({
          id: 'auto-transfer_schedule-1_1000',
          name: AUTO_TRANSFER_TRANSFER_JOB,
          data: { scheduleId: 'schedule-1' },
        } as any),
      ).rejects.toThrow('insufficient balance');
      await flushMicrotasks();

      expect(financeNotificationService.notifyAutoTransferFailed).toHaveBeenCalledWith(schedule);
      expect(schedulesService.rescheduleScheduleJobs).not.toHaveBeenCalled();
    });
  });

  describe('reminder job', () => {
    it('notifies upcoming transfer and updates lastReminderRunDate on happy path', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      scheduleRepo.update.mockResolvedValue(undefined);

      await processor.process({
        id: 'auto-transfer-reminder_schedule-1_1000',
        name: AUTO_TRANSFER_REMINDER_JOB,
        data: { scheduleId: 'schedule-1' },
      } as any);

      expect(financeNotificationService.notifyAutoTransferUpcoming).toHaveBeenCalledWith(schedule);
      expect(scheduleRepo.update).toHaveBeenCalledWith(
        { id: schedule.id },
        { lastReminderRunDate: schedule.nextRunDate },
      );
    });

    it('does not call notifyAutoTransferFailed on reminder failure (only transfer jobs do)', async () => {
      const schedule = makeSchedule();
      scheduleRepo.findOne.mockResolvedValue(schedule);
      financeNotificationService.notifyAutoTransferUpcoming.mockRejectedValue(new Error('notify failed'));

      await expect(
        processor.process({
          id: 'auto-transfer-reminder_schedule-1_1000',
          name: AUTO_TRANSFER_REMINDER_JOB,
          data: { scheduleId: 'schedule-1' },
        } as any),
      ).rejects.toThrow('notify failed');

      expect(financeNotificationService.notifyAutoTransferFailed).not.toHaveBeenCalled();
    });
  });

  it('throws for an unknown job name and does not retry-swallow it', async () => {
    scheduleRepo.findOne.mockResolvedValue(makeSchedule());

    await expect(
      processor.process({
        id: 'some-job_schedule-1_1000',
        name: 'unknown-job',
        data: { scheduleId: 'schedule-1' },
      } as any),
    ).rejects.toThrow('Unknown auto-transfer job: unknown-job');
  });
});
