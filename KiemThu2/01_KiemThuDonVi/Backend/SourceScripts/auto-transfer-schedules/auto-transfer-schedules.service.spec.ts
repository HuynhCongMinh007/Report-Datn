import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutoTransferSchedulesService } from './auto-transfer-schedules.service';
import { AllocationType, FrequencyType } from '@/database/entities/financial/auto-transfer-schedule.entity';

describe('AutoTransferSchedulesService (FIN-UC05 — lên lịch giao dịch định kỳ)', () => {
  let service: AutoTransferSchedulesService;

  const schedulesRepository = {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    findByIdUnsafe: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const jarsRepository = {
    findUserJarById: jest.fn(),
    findActiveUserJars: jest.fn(),
    updateJarBalanceFromTransactions: jest.fn().mockResolvedValue(undefined),
    updateMultipleJarsBalance: jest.fn().mockResolvedValue(undefined),
  };

  const transactionRepository = {};

  const scheduleEntityRepo = { findOne: jest.fn(), update: jest.fn() };
  const queryRunnerManager = {
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: queryRunnerManager,
  };
  const dataSource = {
    getRepository: jest.fn(() => scheduleEntityRepo),
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const autoTransferQueueService = {
    reschedule: jest.fn().mockResolvedValue(undefined),
    cancelScheduledJobs: jest.fn().mockResolvedValue(undefined),
  };

  const makeSchedule = (overrides: Record<string, any> = {}) => ({
    id: 'sched-1',
    userId: 'user-1',
    name: 'Lương hàng tháng',
    amount: 5000000,
    frequency: FrequencyType.MONTHLY,
    allocationType: AllocationType.DEFAULT,
    isActive: true,
    runTime: '08:00',
    timezone: 'Asia/Ho_Chi_Minh',
    nextRunDate: new Date('2026-08-01T01:00:00.000Z'),
    transactionType: 'income',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutoTransferSchedulesService(
      schedulesRepository as any,
      jarsRepository as any,
      transactionRepository as any,
      dataSource as any,
      autoTransferQueueService as any,
    );
  });

  describe('createSchedule', () => {
    it('rejects an expense schedule without a target expense jar', async () => {
      await expect(
        service.createSchedule('user-1', {
          name: 'Tiền nhà',
          amount: 2000000,
          frequency: FrequencyType.MONTHLY,
          transactionType: 'expense',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expense schedule whose jar does not belong to the user', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.createSchedule('user-1', {
          name: 'Tiền nhà',
          amount: 2000000,
          frequency: FrequencyType.MONTHLY,
          transactionType: 'expense',
          expenseJarId: 'jar-unknown',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a custom-allocation income schedule whose percentages do not sum to 100', async () => {
      await expect(
        service.createSchedule('user-1', {
          name: 'Lương',
          amount: 5000000,
          frequency: FrequencyType.MONTHLY,
          allocationType: AllocationType.CUSTOM,
          customAllocations: [{ jarId: 'jar-1', percentage: 60 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(schedulesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects default allocation when the user has no active jars', async () => {
      jarsRepository.findActiveUserJars.mockResolvedValue([]);

      await expect(
        service.createSchedule('user-1', {
          name: 'Lương',
          amount: 5000000,
          frequency: FrequencyType.MONTHLY,
          allocationType: AllocationType.DEFAULT,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a recurring income schedule and reschedules the transfer queue', async () => {
      jarsRepository.findActiveUserJars.mockResolvedValue([{ id: 'jar-1' }]);
      const created = makeSchedule();
      schedulesRepository.create.mockResolvedValue(created);
      schedulesRepository.findById.mockResolvedValue(created);

      const result = await service.createSchedule('user-1', {
        name: 'Lương hàng tháng',
        amount: 5000000,
        frequency: FrequencyType.MONTHLY,
        allocationType: AllocationType.DEFAULT,
        dayOfMonth: 1,
      } as any);

      expect(schedulesRepository.create).toHaveBeenCalled();
      expect(autoTransferQueueService.reschedule).toHaveBeenCalledWith(created);
      expect(result.id).toBe('sched-1');
    });

    it('creates a SINGLE_JAR allocation schedule when the target jar belongs to the user', async () => {
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });
      const created = makeSchedule({ allocationType: AllocationType.SINGLE_JAR, targetJarId: 'jar-1' });
      schedulesRepository.create.mockResolvedValue(created);
      schedulesRepository.findById.mockResolvedValue(created);

      const result = await service.createSchedule('user-1', {
        name: 'Lương hàng tháng',
        amount: 5000000,
        frequency: FrequencyType.MONTHLY,
        allocationType: AllocationType.SINGLE_JAR,
        targetJarId: 'jar-1',
      } as any);

      expect(result.id).toBe('sched-1');
    });

    it('rejects a custom-allocation schedule with no allocations provided', async () => {
      await expect(
        service.createSchedule('user-1', {
          name: 'Lương',
          amount: 5000000,
          frequency: FrequencyType.MONTHLY,
          allocationType: AllocationType.CUSTOM,
          customAllocations: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a custom-allocation schedule whose target jar does not belong to the user', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.createSchedule('user-1', {
          name: 'Lương',
          amount: 5000000,
          frequency: FrequencyType.MONTHLY,
          allocationType: AllocationType.CUSTOM,
          customAllocations: [{ jarId: 'jar-unknown', percentage: 100 }],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a custom-allocation schedule when percentages sum to 100 and all jars exist', async () => {
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });
      const created = makeSchedule({ allocationType: AllocationType.CUSTOM });
      schedulesRepository.create.mockResolvedValue(created);
      schedulesRepository.findById.mockResolvedValue(created);

      const result = await service.createSchedule('user-1', {
        name: 'Lương',
        amount: 5000000,
        frequency: FrequencyType.MONTHLY,
        allocationType: AllocationType.CUSTOM,
        customAllocations: [
          { jarId: 'jar-1', percentage: 60 },
          { jarId: 'jar-2', percentage: 40 },
        ],
      } as any);

      expect(result.id).toBe('sched-1');
    });
  });

  describe('deleteSchedule', () => {
    it('rejects deleting a schedule that does not belong to the user', async () => {
      schedulesRepository.findById.mockResolvedValue(null);

      await expect(service.deleteSchedule('sched-x', 'user-1')).rejects.toThrow(NotFoundException);
      expect(autoTransferQueueService.cancelScheduledJobs).not.toHaveBeenCalled();
    });

    it('cancels queued jobs and deletes an owned schedule', async () => {
      const schedule = makeSchedule();
      schedulesRepository.findById.mockResolvedValue(schedule);

      await service.deleteSchedule('sched-1', 'user-1');

      expect(autoTransferQueueService.cancelScheduledJobs).toHaveBeenCalledWith(schedule);
      expect(schedulesRepository.delete).toHaveBeenCalledWith('sched-1', 'user-1');
    });
  });

  describe('toggleActive', () => {
    it('rejects toggling a schedule that does not belong to the user', async () => {
      schedulesRepository.findById.mockResolvedValue(null);

      await expect(service.toggleActive('sched-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('deactivates an active schedule and reschedules the queue', async () => {
      const schedule = makeSchedule({ isActive: true });
      const updated = makeSchedule({ isActive: false });
      schedulesRepository.findById
        .mockResolvedValueOnce(schedule)
        .mockResolvedValueOnce(updated);
      schedulesRepository.update.mockResolvedValue(updated);

      const result = await service.toggleActive('sched-1', 'user-1');

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ isActive: false }),
      );
      expect(autoTransferQueueService.reschedule).toHaveBeenCalled();
      expect(result.isActive).toBe(false);
    });

    it('recalculates nextRunDate when activating a schedule whose nextRunDate is in the past', async () => {
      const schedule = makeSchedule({ isActive: false, nextRunDate: new Date('2020-01-01T00:00:00.000Z') });
      const updated = makeSchedule({ isActive: true });
      schedulesRepository.findById
        .mockResolvedValueOnce(schedule)
        .mockResolvedValueOnce(updated);
      schedulesRepository.update.mockResolvedValue(updated);

      await service.toggleActive('sched-1', 'user-1');

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ isActive: true, nextRunDate: expect.any(Date) }),
      );
      const [, , payload] = schedulesRepository.update.mock.calls[0];
      expect(payload.nextRunDate.getTime()).toBeGreaterThan(schedule.nextRunDate.getTime());
    });

    it('keeps the existing nextRunDate when activating a schedule whose nextRunDate is still in the future', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const schedule = makeSchedule({ isActive: false, nextRunDate: futureDate });
      const updated = makeSchedule({ isActive: true, nextRunDate: futureDate });
      schedulesRepository.findById
        .mockResolvedValueOnce(schedule)
        .mockResolvedValueOnce(updated);
      schedulesRepository.update.mockResolvedValue(updated);

      await service.toggleActive('sched-1', 'user-1');

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ isActive: true, nextRunDate: futureDate }),
      );
    });
  });

  describe('updateSchedule', () => {
    it('rejects updating a schedule that does not belong to the user', async () => {
      schedulesRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateSchedule('sched-x', 'user-1', { amount: 6000000 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('re-validates allocations when the allocation type is changed', async () => {
      const schedule = makeSchedule({ allocationType: AllocationType.DEFAULT });
      schedulesRepository.findById.mockResolvedValue(schedule);
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.updateSchedule('sched-1', 'user-1', {
          allocationType: AllocationType.SINGLE_JAR,
          targetJarId: 'jar-unknown',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('recalculates the next run date when the frequency changes and reschedules the queue', async () => {
      const schedule = makeSchedule({ frequency: FrequencyType.MONTHLY });
      const updated = makeSchedule({ frequency: FrequencyType.WEEKLY, dayOfWeek: 1 });
      schedulesRepository.findById
        .mockResolvedValueOnce(schedule)
        .mockResolvedValueOnce(updated);
      schedulesRepository.update.mockResolvedValue(updated);

      const result = await service.updateSchedule('sched-1', 'user-1', {
        frequency: FrequencyType.WEEKLY,
        dayOfWeek: 1,
      } as any);

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ nextRunDate: expect.any(Date) }),
      );
      expect(autoTransferQueueService.reschedule).toHaveBeenCalledWith(updated);
      expect(result.frequency).toBe(FrequencyType.WEEKLY);
    });

    it('updates simple fields (e.g. amount) without touching the allocation or timing', async () => {
      const schedule = makeSchedule({ amount: 5000000 });
      const updated = makeSchedule({ amount: 7000000 });
      schedulesRepository.findById
        .mockResolvedValueOnce(schedule)
        .mockResolvedValueOnce(updated);
      schedulesRepository.update.mockResolvedValue(updated);

      const result = await service.updateSchedule('sched-1', 'user-1', {
        amount: 7000000,
      } as any);

      expect(result.amount).toBe(7000000);
    });

    it('converts a provided endDate string into a Date', async () => {
      const schedule = makeSchedule();
      schedulesRepository.findById.mockResolvedValue(schedule);
      schedulesRepository.update.mockResolvedValue(schedule);

      await service.updateSchedule('sched-1', 'user-1', {
        endDate: '2026-12-31',
      } as any);

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ endDate: new Date('2026-12-31') }),
      );
    });

    it('clears endDate to null when given an empty string', async () => {
      const schedule = makeSchedule();
      schedulesRepository.findById.mockResolvedValue(schedule);
      schedulesRepository.update.mockResolvedValue(schedule);

      await service.updateSchedule('sched-1', 'user-1', {
        endDate: '',
      } as any);

      expect(schedulesRepository.update).toHaveBeenCalledWith(
        'sched-1',
        'user-1',
        expect.objectContaining({ endDate: null }),
      );
    });
  });

  describe('calculateNextRunDate', () => {
    it('falls back to UTC when given an invalid timezone', () => {
      const result = service.calculateNextRunDate('Not/A_Timezone', FrequencyType.DAILY, '00:00');
      expect(result).toBeInstanceOf(Date);
    });

    it('DAILY: rolls over to the next day when today\'s run time has already passed', () => {
      const result = service.calculateNextRunDate('Asia/Ho_Chi_Minh', FrequencyType.DAILY, '00:00');
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });

    it('WEEKLY: computes the next occurrence of a given day of week', () => {
      const result = service.calculateNextRunDate(
        'Asia/Ho_Chi_Minh',
        FrequencyType.WEEKLY,
        '08:00',
        1,
      );
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });

    it('WEEKLY: falls back to today/next-week when no dayOfWeek is provided', () => {
      const result = service.calculateNextRunDate('Asia/Ho_Chi_Minh', FrequencyType.WEEKLY, '00:00');
      expect(result).toBeInstanceOf(Date);
    });

    it('MONTHLY: uses the given dayOfMonth, clamped to the month length', () => {
      const result = service.calculateNextRunDate(
        'Asia/Ho_Chi_Minh',
        FrequencyType.MONTHLY,
        '08:00',
        undefined,
        31,
      );
      expect(result).toBeInstanceOf(Date);
    });

    it('MONTHLY: falls back to today/next-month when no dayOfMonth is provided', () => {
      const result = service.calculateNextRunDate('Asia/Ho_Chi_Minh', FrequencyType.MONTHLY, '00:00');
      expect(result).toBeInstanceOf(Date);
    });

    it('YEARLY: uses the given month/day, clamped to the target month length', () => {
      const result = service.calculateNextRunDate(
        'Asia/Ho_Chi_Minh',
        FrequencyType.YEARLY,
        '08:00',
        undefined,
        29,
        2,
      );
      expect(result).toBeInstanceOf(Date);
    });

    it('YEARLY: falls back to today/next-year when no month/day is provided', () => {
      const result = service.calculateNextRunDate('Asia/Ho_Chi_Minh', FrequencyType.YEARLY, '00:00');
      expect(result).toBeInstanceOf(Date);
    });

    it('CUSTOM: rolls over to next month when today\'s run time has already passed', () => {
      const result = service.calculateNextRunDate('Asia/Ho_Chi_Minh', FrequencyType.CUSTOM, '00:00');
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getSchedules / getScheduleDetail / rescheduleScheduleJobs', () => {
    it('getSchedules maps every schedule of the user to a list item', async () => {
      schedulesRepository.findByUserId.mockResolvedValue([makeSchedule(), makeSchedule({ id: 'sched-2' })]);

      const result = await service.getSchedules('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sched-1');
    });

    it('getScheduleDetail throws NotFoundException when the schedule does not belong to the user', async () => {
      schedulesRepository.findById.mockResolvedValue(null);

      await expect(service.getScheduleDetail('sched-x', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('getScheduleDetail returns the mapped schedule when found', async () => {
      schedulesRepository.findById.mockResolvedValue(makeSchedule());

      const result = await service.getScheduleDetail('sched-1', 'user-1');

      expect(result.id).toBe('sched-1');
    });

    it('rescheduleScheduleJobs does nothing when the schedule no longer exists', async () => {
      schedulesRepository.findByIdUnsafe.mockResolvedValue(null);

      await service.rescheduleScheduleJobs('sched-x');

      expect(autoTransferQueueService.reschedule).not.toHaveBeenCalled();
    });

    it('rescheduleScheduleJobs reschedules the queue for an existing schedule, forwarding skipJobIds', async () => {
      const schedule = makeSchedule();
      schedulesRepository.findByIdUnsafe.mockResolvedValue(schedule);

      await service.rescheduleScheduleJobs('sched-1', ['job-a']);

      expect(autoTransferQueueService.reschedule).toHaveBeenCalledWith(schedule, ['job-a']);
    });
  });

  describe('executeSchedule (FIN-UC05 — thực thi chuyển tiền định kỳ)', () => {
    it('throws NotFoundException when the schedule does not exist', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(null);

      await expect(service.executeSchedule('sched-1')).rejects.toThrow(NotFoundException);
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('skips execution without error when the schedule is not active', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(makeSchedule({ isActive: false }));

      await expect(service.executeSchedule('sched-1')).resolves.toBeUndefined();
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('skips a duplicate BullMQ retry for a run already committed (lastRunDate >= targetRunAt)', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ lastRunDate: new Date('2026-08-01T00:00:00.000Z') }),
      );

      await service.executeSchedule('sched-1', new Date('2026-07-31T00:00:00.000Z'));

      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('deactivates and skips execution when the schedule has expired', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ endDate: new Date('2020-01-01T00:00:00.000Z') }),
      );

      await service.executeSchedule('sched-1');

      expect(scheduleEntityRepo.update).toHaveBeenCalledWith('sched-1', { isActive: false });
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an expense schedule missing expenseJarId', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ transactionType: 'expense', expenseJarId: null }),
      );

      await expect(service.executeSchedule('sched-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the expense jar no longer belongs to the user', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ transactionType: 'expense', expenseJarId: 'jar-1' }),
      );
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(service.executeSchedule('sched-1')).rejects.toThrow(NotFoundException);
    });

    it('executes an expense schedule: creates the expense transaction and refreshes only the expense jar balance', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ transactionType: 'expense', expenseJarId: 'jar-1', amount: 2000000 }),
      );
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });

      await service.executeSchedule('sched-1');

      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'expense', amount: 2000000, moneyJarId: 'jar-1' }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunnerManager.update).toHaveBeenCalledWith(
        expect.anything(),
        'sched-1',
        expect.objectContaining({ lastRunDate: expect.any(Date), nextRunDate: expect.any(Date) }),
      );
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
    });

    it('executes an income schedule with SINGLE_JAR allocation and refreshes only the target jar balance', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ allocationType: AllocationType.SINGLE_JAR, targetJarId: 'jar-1', amount: 1000000 }),
      );
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });

      await service.executeSchedule('sched-1');

      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'income', amount: 1000000, moneyJarId: 'jar-1' }),
      );
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
      expect(jarsRepository.updateMultipleJarsBalance).not.toHaveBeenCalled();
    });

    it('executes an income schedule with CUSTOM allocation, splitting amount by percentage across jars', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({
          allocationType: AllocationType.CUSTOM,
          customAllocations: [
            { jarId: 'jar-1', percentage: 60 },
            { jarId: 'jar-2', percentage: 40 },
          ],
          amount: 1000000,
        }),
      );
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });
      jarsRepository.findActiveUserJars.mockResolvedValue([{ id: 'jar-1' }, { id: 'jar-2' }]);

      await service.executeSchedule('sched-1');

      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ moneyJarId: 'jar-1', amount: 600000 }),
      );
      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ moneyJarId: 'jar-2', amount: 400000 }),
      );
      expect(jarsRepository.updateMultipleJarsBalance).toHaveBeenCalledWith(['jar-1', 'jar-2']);
    });

    it('executes an income schedule with DEFAULT allocation, distributing by each jar percentage', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ allocationType: AllocationType.DEFAULT, amount: 1000000 }),
      );
      jarsRepository.findActiveUserJars.mockResolvedValue([
        { id: 'jar-1', percentage: 55 },
        { id: 'jar-2', percentage: 45 },
      ]);

      await service.executeSchedule('sched-1');

      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ moneyJarId: 'jar-1', amount: 550000 }),
      );
      expect(queryRunnerManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ moneyJarId: 'jar-2', amount: 450000 }),
      );
    });

    it('rolls back the transaction and throws a business error when the transfer fails mid-commit', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ allocationType: AllocationType.DEFAULT, amount: 1000000 }),
      );
      jarsRepository.findActiveUserJars.mockResolvedValue([{ id: 'jar-1', percentage: 100 }]);
      queryRunnerManager.save.mockRejectedValueOnce(new Error('insert failed'));

      await expect(service.executeSchedule('sched-1')).rejects.toThrow(BadRequestException);

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('does not propagate an error from the post-commit jar balance refresh (transfer already committed)', async () => {
      scheduleEntityRepo.findOne.mockResolvedValue(
        makeSchedule({ transactionType: 'expense', expenseJarId: 'jar-1', amount: 2000000 }),
      );
      jarsRepository.findUserJarById.mockResolvedValue({ id: 'jar-1' });
      jarsRepository.updateJarBalanceFromTransactions.mockRejectedValueOnce(new Error('refresh failed'));

      await expect(service.executeSchedule('sched-1')).resolves.toBeUndefined();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});
