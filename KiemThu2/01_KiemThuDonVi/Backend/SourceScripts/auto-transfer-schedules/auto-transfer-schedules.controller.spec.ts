import { AutoTransferSchedulesController } from './auto-transfer-schedules.controller';

describe('AutoTransferSchedulesController', () => {
  let controller: AutoTransferSchedulesController;

  const schedulesService = {
    getSchedules: jest.fn(),
    getScheduleDetail: jest.fn(),
    createSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
    toggleActive: jest.fn(),
    executeSchedule: jest.fn(),
    rescheduleScheduleJobs: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AutoTransferSchedulesController(schedulesService as any);
  });

  it('getSchedules delegates to service.getSchedules with the current userId', async () => {
    schedulesService.getSchedules.mockResolvedValue([{ id: 'schedule-1' }]);

    const result = await controller.getSchedules('user-1');

    expect(schedulesService.getSchedules).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ id: 'schedule-1' }]);
  });

  it('getScheduleDetail delegates to service.getScheduleDetail with id and userId', async () => {
    schedulesService.getScheduleDetail.mockResolvedValue({ id: 'schedule-1' });

    const result = await controller.getScheduleDetail('user-1', 'schedule-1');

    expect(schedulesService.getScheduleDetail).toHaveBeenCalledWith('schedule-1', 'user-1');
    expect(result).toEqual({ id: 'schedule-1' });
  });

  it('createSchedule delegates to service.createSchedule with userId and body', async () => {
    const dto = { name: 'Chuyển tiết kiệm hàng tháng' } as any;
    schedulesService.createSchedule.mockResolvedValue({ id: 'schedule-new' });

    const result = await controller.createSchedule('user-1', dto);

    expect(schedulesService.createSchedule).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ id: 'schedule-new' });
  });

  it('updateSchedule delegates to service.updateSchedule with id, userId and body', async () => {
    const dto = { name: 'Updated' } as any;
    schedulesService.updateSchedule.mockResolvedValue({ id: 'schedule-1', name: 'Updated' });

    const result = await controller.updateSchedule('user-1', 'schedule-1', dto);

    expect(schedulesService.updateSchedule).toHaveBeenCalledWith('schedule-1', 'user-1', dto);
    expect(result).toEqual({ id: 'schedule-1', name: 'Updated' });
  });

  it('deleteSchedule delegates to service.deleteSchedule with id and userId', async () => {
    schedulesService.deleteSchedule.mockResolvedValue(undefined);

    await controller.deleteSchedule('user-1', 'schedule-1');

    expect(schedulesService.deleteSchedule).toHaveBeenCalledWith('schedule-1', 'user-1');
  });

  it('toggleActive delegates to service.toggleActive with id and userId', async () => {
    schedulesService.toggleActive.mockResolvedValue({ id: 'schedule-1', isActive: false });

    const result = await controller.toggleActive('user-1', 'schedule-1');

    expect(schedulesService.toggleActive).toHaveBeenCalledWith('schedule-1', 'user-1');
    expect(result).toEqual({ id: 'schedule-1', isActive: false });
  });

  describe('executeSchedule', () => {
    it('verifies ownership before executing, then executes and reschedules', async () => {
      schedulesService.getScheduleDetail.mockResolvedValue({ id: 'schedule-1' });
      schedulesService.executeSchedule.mockResolvedValue(undefined);
      schedulesService.rescheduleScheduleJobs.mockResolvedValue(undefined);

      const result = await controller.executeSchedule('user-1', 'schedule-1');

      expect(schedulesService.getScheduleDetail).toHaveBeenCalledWith('schedule-1', 'user-1');
      expect(schedulesService.executeSchedule).toHaveBeenCalledWith('schedule-1');
      expect(schedulesService.rescheduleScheduleJobs).toHaveBeenCalledWith('schedule-1');
      expect(result).toEqual({ message: 'Schedule executed successfully' });
    });

    it('propagates the error and skips execution when ownership check fails', async () => {
      schedulesService.getScheduleDetail.mockRejectedValue(new Error('not found'));

      await expect(controller.executeSchedule('user-1', 'missing')).rejects.toThrow('not found');
      expect(schedulesService.executeSchedule).not.toHaveBeenCalled();
    });
  });
});
