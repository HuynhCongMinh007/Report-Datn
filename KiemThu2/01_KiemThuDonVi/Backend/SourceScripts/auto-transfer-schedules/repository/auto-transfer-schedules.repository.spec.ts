import { AutoTransferSchedulesRepository } from './auto-transfer-schedules.repository';

// Chainable stub for TypeORM's SelectQueryBuilder covering the subset of methods
// this repository uses: leftJoinAndSelect/select/addSelect/where/andWhere/orderBy,
// plus getRawAndEntities (used by findByUserId/findById) and getMany.
function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['leftJoinAndSelect', 'select', 'addSelect', 'where', 'andWhere', 'orderBy'].forEach((method) => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.getRawAndEntities = jest.fn().mockResolvedValue(
    overrides.getRawAndEntities ?? { entities: [], raw: [] },
  );
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  return qb;
}

describe('AutoTransferSchedulesRepository', () => {
  let repository: AutoTransferSchedulesRepository;

  const repo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new AutoTransferSchedulesRepository(repo as any);
  });

  describe('findByUserId', () => {
    it('scopes to the user and attaches the joined targetJarName onto each entity', async () => {
      const entity: any = { id: 'schedule-1' };
      const qb = makeQueryBuilderMock({
        getRawAndEntities: { entities: [entity], raw: [{ targetJarName: 'Thiết yếu' }] },
      });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findByUserId('user-1');

      expect(qb.where).toHaveBeenCalledWith('schedule.userId = :userId', { userId: 'user-1' });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: 'schedule-1', targetJarName: 'Thiết yếu' }]);
    });

    it('applies the isActive filter when provided', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findByUserId('user-1', true);

      expect(qb.andWhere).toHaveBeenCalledWith('schedule.isActive = :isActive', { isActive: true });
    });
  });

  describe('findById', () => {
    it('returns null when no entity is found', async () => {
      const qb = makeQueryBuilderMock({ getRawAndEntities: { entities: [], raw: [] } });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findById('schedule-1', 'user-1');

      expect(result).toBeNull();
    });

    it('returns the entity with targetJarName attached when found', async () => {
      const entity: any = { id: 'schedule-1' };
      const qb = makeQueryBuilderMock({
        getRawAndEntities: { entities: [entity], raw: [{ targetJarName: 'Giáo dục' }] },
      });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findById('schedule-1', 'user-1');

      expect(qb.where).toHaveBeenCalledWith('schedule.id = :id AND schedule.userId = :userId', {
        id: 'schedule-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ id: 'schedule-1', targetJarName: 'Giáo dục' });
    });
  });

  describe('findByIdUnsafe', () => {
    it('delegates to repository.findOne without a userId scope', async () => {
      repo.findOne.mockResolvedValue({ id: 'schedule-1' });

      const result = await repository.findByIdUnsafe('schedule-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'schedule-1' } });
      expect(result).toEqual({ id: 'schedule-1' });
    });
  });

  describe('findActiveSchedules', () => {
    it('finds all schedules where isActive is true', async () => {
      repo.find.mockResolvedValue([{ id: 'schedule-1' }]);

      const result = await repository.findActiveSchedules();

      expect(repo.find).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(result).toEqual([{ id: 'schedule-1' }]);
    });
  });

  describe('findSchedulesNeedingReminder', () => {
    it('builds the reminder-window query and returns matches', async () => {
      const qb = makeQueryBuilderMock({ getMany: [{ id: 'schedule-1' }] });
      repo.createQueryBuilder.mockReturnValue(qb);
      const currentDate = new Date('2026-08-01T00:00:00.000Z');
      const reminderWindowEnd = new Date('2026-08-02T00:00:00.000Z');

      const result = await repository.findSchedulesNeedingReminder(currentDate, reminderWindowEnd);

      expect(qb.where).toHaveBeenCalledWith('schedule.isActive = :isActive', { isActive: true });
      expect(qb.andWhere).toHaveBeenCalledWith('schedule.notifyBefore = :notifyBefore', {
        notifyBefore: true,
      });
      expect(result).toEqual([{ id: 'schedule-1' }]);
    });
  });

  describe('markReminderSent', () => {
    it('updates lastReminderRunDate for the given id', async () => {
      repo.update.mockResolvedValue(undefined);
      const runDate = new Date('2026-08-01T00:00:00.000Z');

      await repository.markReminderSent('schedule-1', runDate);

      expect(repo.update).toHaveBeenCalledWith({ id: 'schedule-1' }, { lastReminderRunDate: runDate });
    });
  });

  describe('updateQueueJobIds', () => {
    it('updates transferJobId and reminderJobId', async () => {
      repo.update.mockResolvedValue(undefined);

      await repository.updateQueueJobIds('schedule-1', { transferJobId: 'job-a', reminderJobId: null });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'schedule-1' },
        { transferJobId: 'job-a', reminderJobId: null },
      );
    });
  });

  describe('create', () => {
    it('creates and saves a new schedule entity', async () => {
      repo.create.mockReturnValue({ name: 'New schedule' });
      repo.save.mockResolvedValue({ id: 'schedule-new', name: 'New schedule' });

      const result = await repository.create({ name: 'New schedule' } as any);

      expect(repo.create).toHaveBeenCalledWith({ name: 'New schedule' });
      expect(repo.save).toHaveBeenCalledWith({ name: 'New schedule' });
      expect(result).toEqual({ id: 'schedule-new', name: 'New schedule' });
    });
  });

  describe('update', () => {
    it('updates the schedule scoped to id+userId and returns the refreshed entity', async () => {
      repo.update.mockResolvedValue(undefined);
      const qb = makeQueryBuilderMock({
        getRawAndEntities: { entities: [{ id: 'schedule-1' }], raw: [{ targetJarName: null }] },
      });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.update('schedule-1', 'user-1', { name: 'Updated' } as any);

      expect(repo.update).toHaveBeenCalledWith({ id: 'schedule-1', userId: 'user-1' }, { name: 'Updated' });
      expect(result).toMatchObject({ id: 'schedule-1' });
    });

    it('throws when the schedule cannot be found after update', async () => {
      repo.update.mockResolvedValue(undefined);
      const qb = makeQueryBuilderMock({ getRawAndEntities: { entities: [], raw: [] } });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        repository.update('schedule-1', 'user-1', { name: 'Updated' } as any),
      ).rejects.toThrow('Schedule not found after update');
    });
  });

  describe('delete', () => {
    it('deletes the schedule scoped to id+userId', async () => {
      repo.delete.mockResolvedValue(undefined);

      await repository.delete('schedule-1', 'user-1');

      expect(repo.delete).toHaveBeenCalledWith({ id: 'schedule-1', userId: 'user-1' });
    });
  });

  describe('updateNextRunDate', () => {
    it('updates the nextRunDate for the given id', async () => {
      const nextRunDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.updateNextRunDate('schedule-1', nextRunDate);

      expect(repo.update).toHaveBeenCalledWith({ id: 'schedule-1' }, { nextRunDate });
    });
  });

  describe('updateLastRunDate', () => {
    it('updates both lastRunDate and nextRunDate for the given id', async () => {
      const lastRunDate = new Date('2026-08-01T00:00:00.000Z');
      const nextRunDate = new Date('2026-09-01T00:00:00.000Z');

      await repository.updateLastRunDate('schedule-1', lastRunDate, nextRunDate);

      expect(repo.update).toHaveBeenCalledWith({ id: 'schedule-1' }, { lastRunDate, nextRunDate });
    });
  });
});
