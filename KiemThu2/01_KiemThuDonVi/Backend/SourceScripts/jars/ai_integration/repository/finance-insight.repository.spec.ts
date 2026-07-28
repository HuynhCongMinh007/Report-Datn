import { FinanceInsightRepository } from './finance-insight.repository';
import { AiFinanceInsightStatus } from '@/database/entities/ai_core/ai-finance-insight-snapshot.entity';

function makeInsertQueryBuilderMock(rawRows: any[]) {
  const qb: Record<string, jest.Mock> = {};
  ['insert', 'values', 'orIgnore', 'returning'].forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.execute = jest.fn().mockResolvedValue({ raw: rawRows });
  return qb;
}

function makeUpdateQueryBuilderMock(affected: number) {
  const qb: Record<string, jest.Mock> = {};
  ['update', 'set', 'where', 'andWhere'].forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.execute = jest.fn().mockResolvedValue({ affected });
  return qb;
}

describe('FinanceInsightRepository', () => {
  let repository: FinanceInsightRepository;

  const mockRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FinanceInsightRepository(mockRepo as any);
  });

  describe('findForDate', () => {
    it('queries by userId/month/year/analysisDate', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'snap-1' });

      const result = await repository.findForDate('user-1', 7, 2026, '2026-07-01');

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', month: 7, year: 2026, analysisDate: '2026-07-01' },
      });
      expect(result).toEqual({ id: 'snap-1' });
    });
  });

  describe('findLatest', () => {
    it('queries by userId/month/year ordered by most recent', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findLatest('user-1', 7, 2026);

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', month: 7, year: 2026 },
        order: { analysisDate: 'DESC', updatedAt: 'DESC' },
      });
      expect(result).toBeNull();
    });
  });

  describe('createGenerating', () => {
    it('returns true when the insert wins the race (a row is returned)', async () => {
      const qb = makeInsertQueryBuilderMock([{ id: 'snap-1' }]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.createGenerating('user-1', 7, 2026, '2026-07-01');

      expect(qb.values).toHaveBeenCalledWith(
        expect.objectContaining({ status: AiFinanceInsightStatus.GENERATING }),
      );
      expect(result).toBe(true);
    });

    it('returns false when the insert is ignored (row already exists)', async () => {
      const qb = makeInsertQueryBuilderMock([]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.createGenerating('user-1', 7, 2026, '2026-07-01');

      expect(result).toBe(false);
    });
  });

  describe('acquireExisting', () => {
    it('re-acquires a stale GENERATING snapshot', async () => {
      const qb = makeUpdateQueryBuilderMock(1);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.acquireExisting(
        { id: 'snap-1', status: AiFinanceInsightStatus.GENERATING } as any,
        false,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('updated_at < :staleAt', {
        staleAt: expect.any(Date),
      });
      expect(result).toBe(true);
    });

    it('returns false without executing the update when COMPLETED and force is not set', async () => {
      const qb = makeUpdateQueryBuilderMock(0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.acquireExisting(
        { id: 'snap-1', status: AiFinanceInsightStatus.COMPLETED } as any,
        false,
      );

      expect(qb.execute).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('re-acquires a COMPLETED snapshot when force=true', async () => {
      const qb = makeUpdateQueryBuilderMock(1);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.acquireExisting(
        { id: 'snap-1', status: AiFinanceInsightStatus.COMPLETED } as any,
        true,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('status != :generating', {
        generating: AiFinanceInsightStatus.GENERATING,
      });
      expect(result).toBe(true);
    });

    it('re-acquires a FAILED snapshot (else branch) and returns false when nothing was updated', async () => {
      const qb = makeUpdateQueryBuilderMock(0);
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.acquireExisting(
        { id: 'snap-1', status: AiFinanceInsightStatus.FAILED } as any,
        false,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('status != :generating', {
        generating: AiFinanceInsightStatus.GENERATING,
      });
      expect(result).toBe(false);
    });
  });

  describe('markCompleted', () => {
    it('updates the snapshot with the generated result', async () => {
      mockRepo.update.mockResolvedValue(undefined);

      await repository.markCompleted('snap-1', { insight: 'ok' }, new Date('2026-07-01'));

      expect(mockRepo.update).toHaveBeenCalledWith('snap-1', {
        status: AiFinanceInsightStatus.COMPLETED,
        result: { insight: 'ok' },
        generatedAt: new Date('2026-07-01'),
        failureReason: null,
      });
    });
  });

  describe('markFailed', () => {
    it('marks as COMPLETED (keeps prior result) when the snapshot already has a result', async () => {
      mockRepo.update.mockResolvedValue(undefined);

      await repository.markFailed(
        { id: 'snap-1', result: { insight: 'old' } } as any,
        'timeout',
      );

      expect(mockRepo.update).toHaveBeenCalledWith('snap-1', {
        status: AiFinanceInsightStatus.COMPLETED,
        failureReason: 'timeout',
      });
    });

    it('marks as FAILED when the snapshot has no prior result', async () => {
      mockRepo.update.mockResolvedValue(undefined);

      await repository.markFailed({ id: 'snap-1', result: null } as any, 'timeout');

      expect(mockRepo.update).toHaveBeenCalledWith('snap-1', {
        status: AiFinanceInsightStatus.FAILED,
        failureReason: 'timeout',
      });
    });
  });
});
