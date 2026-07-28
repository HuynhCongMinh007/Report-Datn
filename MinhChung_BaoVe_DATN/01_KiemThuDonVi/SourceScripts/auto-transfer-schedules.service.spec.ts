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
  };

  const transactionRepository = {};
  const dataSource = {};

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
  });
});
