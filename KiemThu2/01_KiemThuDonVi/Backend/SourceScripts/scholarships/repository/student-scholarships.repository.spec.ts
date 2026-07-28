import { StudentScholarshipsRepository } from './student-scholarships.repository';
import { StudentScholarshipStatus } from '@/database/entities';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take', 'select', 'addSelect', 'groupBy'].forEach(
    (method) => {
      qb[method] = jest.fn().mockReturnValue(qb);
    },
  );
  qb.getManyAndCount = jest.fn().mockResolvedValue(overrides.getManyAndCount ?? [[], 0]);
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  qb.getOne = jest.fn().mockResolvedValue(overrides.getOne ?? null);
  qb.getRawMany = jest.fn().mockResolvedValue(overrides.getRawMany ?? []);
  return qb;
}

describe('StudentScholarshipsRepository', () => {
  let repository: StudentScholarshipsRepository;

  const repo = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const historyRepository = { save: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new StudentScholarshipsRepository(repo as any, historyRepository as any);
  });

  describe('findAll', () => {
    it('scopes by userId only when scholarshipId is absent', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll('user-1');

      expect(qb.where).toHaveBeenCalledWith('studentScholarship.userId = :userId', { userId: 'user-1' });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('uses andWhere for scholarshipId when userId is also present', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll('user-1', 'scholarship-1');

      expect(qb.where).toHaveBeenCalledWith('studentScholarship.userId = :userId', { userId: 'user-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('studentScholarship.scholarshipId = :scholarshipId', {
        scholarshipId: 'scholarship-1',
      });
    });

    it('uses where (not andWhere) for scholarshipId when userId is absent', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll(undefined, 'scholarship-1');

      expect(qb.where).toHaveBeenCalledWith('studentScholarship.scholarshipId = :scholarshipId', {
        scholarshipId: 'scholarship-1',
      });
    });

    it('clamps limit between 1 and 100', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll(undefined, undefined, 1, 500);

      expect(qb.take).toHaveBeenCalledWith(100);
    });
  });

  describe('update (DRAFT-only mutation guard)', () => {
    it('allows updating a DRAFT application', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.DRAFT } });
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.update.mockResolvedValue(undefined);

      await repository.update('app-1', { note: 'updated' } as any, 'user-1');

      expect(repo.update).toHaveBeenCalledWith({ id: 'app-1', userId: 'user-1' }, { note: 'updated' });
    });

    it('throws when the application does not belong to the user (findOne returns null)', async () => {
      const qb = makeQueryBuilderMock({ getOne: null });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.update('app-1', {} as any, 'user-1')).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND_OR_UNAUTHORIZED,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws when the application is no longer in DRAFT status', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.SUBMITTED } });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.update('app-1', {} as any, 'user-1')).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.CANNOT_UPDATE_NON_DRAFT_STATUS,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('submit (DRAFT-only transition)', () => {
    it('transitions a DRAFT application to SUBMITTED, defaulting form url/note from existing record', async () => {
      const existing = {
        id: 'app-1',
        status: StudentScholarshipStatus.DRAFT,
        submittedFormUrl: 'https://old-form.pdf',
        note: 'old note',
      };
      const qb = makeQueryBuilderMock({ getOne: existing });
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.update.mockResolvedValue(undefined);

      await repository.submit('app-1', 'user-1');

      expect(repo.update).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({
          status: StudentScholarshipStatus.SUBMITTED,
          submittedFormUrl: 'https://old-form.pdf',
          note: 'old note',
        }),
      );
    });

    it('throws when the application is not found/unauthorized', async () => {
      const qb = makeQueryBuilderMock({ getOne: null });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.submit('app-1', 'user-1')).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND_OR_UNAUTHORIZED,
      );
    });

    it('throws when the application is not in DRAFT status', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.SUBMITTED } });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.submit('app-1', 'user-1')).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.CAN_ONLY_SUBMIT_DRAFT_STATUS,
      );
    });
  });

  describe('updateStatus', () => {
    it('records a history entry when the status actually changes', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.SUBMITTED } });
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.update.mockResolvedValue(undefined);
      historyRepository.save.mockResolvedValue(undefined);

      await repository.updateStatus('app-1', { status: StudentScholarshipStatus.APPROVED, feedback: 'ok' }, 'reviewer-1');

      expect(historyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          studentScholarshipId: 'app-1',
          fromStatus: StudentScholarshipStatus.SUBMITTED,
          toStatus: StudentScholarshipStatus.APPROVED,
          note: 'ok',
          changedBy: 'reviewer-1',
        }),
      );
    });

    it('does not record history when the status is unchanged', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.SUBMITTED } });
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.update.mockResolvedValue(undefined);

      await repository.updateStatus('app-1', { note: 'just a note update' } as any);

      expect(historyRepository.save).not.toHaveBeenCalled();
    });

    it('throws when the application does not exist at all', async () => {
      const qb = makeQueryBuilderMock({ getOne: null });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.updateStatus('missing', {} as any)).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND,
      );
    });
  });

  describe('remove (DRAFT-only deletion guard)', () => {
    it('deletes a DRAFT application', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.DRAFT } });
      repo.createQueryBuilder.mockReturnValue(qb);
      repo.delete.mockResolvedValue(undefined);

      await repository.remove('app-1', 'user-1');

      expect(repo.delete).toHaveBeenCalledWith({ id: 'app-1', userId: 'user-1' });
    });

    it('throws when the application is not in DRAFT status', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'app-1', status: StudentScholarshipStatus.APPROVED } });
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(repository.remove('app-1', 'user-1')).rejects.toThrow(
        SCHOLARSHIPS_CONSTANT.CAN_ONLY_DELETE_DRAFT_STATUS,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('cancelApplication', () => {
    it('returns true when a DRAFT/SUBMITTED application is cancelled', async () => {
      const qb: Record<string, jest.Mock> = {};
      ['update', 'set', 'where', 'andWhere'].forEach((m) => (qb[m] = jest.fn().mockReturnValue(qb)));
      qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.cancelApplication('app-1', 'user-1');

      expect(qb.set).toHaveBeenCalledWith({ status: StudentScholarshipStatus.CANCELLED });
      expect(result).toBe(true);
    });

    it('returns false when no matching row was cancelled', async () => {
      const qb: Record<string, jest.Mock> = {};
      ['update', 'set', 'where', 'andWhere'].forEach((m) => (qb[m] = jest.fn().mockReturnValue(qb)));
      qb.execute = jest.fn().mockResolvedValue({ affected: 0 });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.cancelApplication('app-1', 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('countByScholarshipIds', () => {
    it('returns an empty object without querying when ids is empty', async () => {
      const result = await repository.countByScholarshipIds([]);

      expect(result).toEqual({});
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maps grouped raw counts into a scholarshipId -> count record', async () => {
      const qb = makeQueryBuilderMock({
        getRawMany: [
          { scholarshipId: 'scholarship-1', count: '3' },
          { scholarshipId: 'scholarship-2', count: '5' },
        ],
      });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.countByScholarshipIds(['scholarship-1', 'scholarship-2']);

      expect(result).toEqual({ 'scholarship-1': 3, 'scholarship-2': 5 });
    });
  });

  describe('findRecentByScholarshipIds', () => {
    it('returns an empty array without querying when ids is empty', async () => {
      const result = await repository.findRecentByScholarshipIds([]);

      expect(result).toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('applies the take limit and excludes sponsor-hidden statuses', async () => {
      const qb = makeQueryBuilderMock({ getMany: [{ id: 'app-1' }] });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findRecentByScholarshipIds(['scholarship-1'], 3);

      expect(qb.take).toHaveBeenCalledWith(3);
      expect(qb.andWhere).toHaveBeenCalledWith('studentScholarship.status NOT IN (:...hiddenStatuses)', {
        hiddenStatuses: [StudentScholarshipStatus.DRAFT, StudentScholarshipStatus.CANCELLED],
      });
      expect(result).toEqual([{ id: 'app-1' }]);
    });
  });
});
