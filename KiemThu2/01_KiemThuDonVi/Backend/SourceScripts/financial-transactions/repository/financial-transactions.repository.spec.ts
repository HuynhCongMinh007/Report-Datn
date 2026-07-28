import { FinancialTransactionsRepository } from './financial-transactions.repository';

function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'update', 'set'].forEach(
    (method) => {
      qb[method] = jest.fn().mockReturnValue(qb);
    },
  );
  qb.getCount = jest.fn().mockResolvedValue(overrides.getCount ?? 0);
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  qb.getOne = jest.fn().mockResolvedValue(overrides.getOne ?? null);
  qb.execute = jest.fn().mockResolvedValue(overrides.execute ?? { affected: 0 });
  return qb;
}

describe('FinancialTransactionsRepository', () => {
  let repository: FinancialTransactionsRepository;

  const transactionRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FinancialTransactionsRepository(transactionRepository as any);
  });

  describe('findTransactions', () => {
    it('applies pagination when limit is not zero', async () => {
      const qb = makeQueryBuilderMock({ getCount: 45, getMany: [{ id: 'tx-1' }] });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findTransactions('user-1', { page: 2, limit: 20 } as any);

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({ transactions: [{ id: 'tx-1' }], total: 45 });
    });

    it('fetches all transactions without pagination when limit is exactly 0', async () => {
      const qb = makeQueryBuilderMock({ getCount: 100, getMany: Array(100).fill({ id: 'tx' }) });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findTransactions('user-1', { limit: 0 } as any);

      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
    });

    it('applies type/jar/budget/date filters only when provided', async () => {
      const qb = makeQueryBuilderMock();
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findTransactions('user-1', {
        type: 'EXPENSE',
        moneyJarId: 'jar-1',
        budgetId: 'tag-1',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('transaction.type = :type', { type: 'EXPENSE' });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.moneyJarId = :jarId', { jarId: 'jar-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.budgetId = :budgetId', { budgetId: 'tag-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.transactionDate >= :startDate', {
        startDate: new Date('2026-07-01'),
      });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.transactionDate <= :endDate', {
        endDate: new Date('2026-07-31'),
      });
    });

    it('skips optional filters entirely when not provided', async () => {
      const qb = makeQueryBuilderMock();
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findTransactions('user-1', {} as any);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('transaction.type'),
        expect.anything(),
      );
    });
  });

  describe('findTransactionById', () => {
    it('scopes the lookup to the transaction id and owning user', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'tx-1' } });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findTransactionById('user-1', 'tx-1');

      expect(qb.where).toHaveBeenCalledWith('transaction.id = :transactionId', { transactionId: 'tx-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('user.id = :userId', { userId: 'user-1' });
      expect(result).toEqual({ id: 'tx-1' });
    });
  });

  describe('createTransaction', () => {
    it('creates and saves using the default repository when no manager is given', async () => {
      transactionRepository.create.mockReturnValue({ amount: 50000 });
      transactionRepository.save.mockResolvedValue({ id: 'tx-new', amount: 50000 });

      const result = await repository.createTransaction({ amount: 50000 } as any);

      expect(transactionRepository.create).toHaveBeenCalledWith({ amount: 50000 });
      expect(result).toEqual({ id: 'tx-new', amount: 50000 });
    });

    it('uses the provided EntityManager repository when given (transactional writes)', async () => {
      const managerRepo = { create: jest.fn().mockReturnValue({ amount: 1 }), save: jest.fn().mockResolvedValue({ id: 'tx-tx' }) };
      const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) } as any;

      const result = await repository.createTransaction({ amount: 1 } as any, manager);

      expect(manager.getRepository).toHaveBeenCalled();
      expect(managerRepo.create).toHaveBeenCalledWith({ amount: 1 });
      expect(result).toEqual({ id: 'tx-tx' });
    });
  });

  describe('updateTransaction', () => {
    it('returns the number of affected rows', async () => {
      const qb = makeQueryBuilderMock({ execute: { affected: 1 } });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.updateTransaction('tx-1', 'user-1', { amount: 60000 } as any);

      expect(qb.set).toHaveBeenCalledWith({ amount: 60000 });
      expect(result).toBe(1);
    });

    it('returns 0 when no row matches the id/userId/isDeleted scope', async () => {
      const qb = makeQueryBuilderMock({ execute: { affected: 0 } });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.updateTransaction('tx-1', 'user-1', {} as any);

      expect(result).toBe(0);
    });

    it('returns 0 when affected is undefined', async () => {
      const qb = makeQueryBuilderMock({ execute: {} });
      transactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.updateTransaction('tx-1', 'user-1', {} as any);

      expect(result).toBe(0);
    });
  });

  describe('deleteTransaction', () => {
    it('soft-deletes the transaction by id', async () => {
      transactionRepository.update.mockResolvedValue(undefined);

      await repository.deleteTransaction('tx-1');

      expect(transactionRepository.update).toHaveBeenCalledWith('tx-1', { isDeleted: true });
    });
  });
});
