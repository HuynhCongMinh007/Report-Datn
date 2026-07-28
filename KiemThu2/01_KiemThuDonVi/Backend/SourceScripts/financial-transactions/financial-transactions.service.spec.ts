import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FinancialTransactionsService } from './financial-transactions.service';
import { FinancialRecordType } from '@/database/entities/financial/financial-transaction.entity';

describe('FinancialTransactionsService', () => {
  let service: FinancialTransactionsService;

  const transactionsRepository = {
    findTransactions: jest.fn(),
    findTransactionById: jest.fn(),
    createTransaction: jest.fn(),
    updateTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
  };

  const jarsRepository = {
    findUserJarById: jest.fn(),
    findActiveUserJars: jest.fn(),
    ensureDefaultTagsForJar: jest.fn(),
    findJarTagById: jest.fn(),
    updateJarBalanceFromTransactions: jest.fn(),
    updateBudgetSpentFromTransactions: jest.fn(),
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {},
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
    getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(null) })),
  };

  const financeNotificationService = {
    checkJarThresholdNotifications: jest.fn().mockResolvedValue(undefined),
    checkBudgetNotifications: jest.fn().mockResolvedValue(undefined),
  };

  const makeJar = (overrides: Record<string, any> = {}) => ({
    id: 'jar-1',
    name: 'Thiết yếu',
    categoryType: 'essentials',
    percentage: 55,
    ...overrides,
  });

  const makeTag = (overrides: Record<string, any> = {}) => ({
    id: 'tag-1',
    name: 'Khác',
    slug: 'khac',
    moneyJar: { id: 'jar-1' },
    ...overrides,
  });

  const makeTransaction = (overrides: Record<string, any> = {}) => ({
    id: 'tx-1',
    type: FinancialRecordType.EXPENSE,
    amount: 100000,
    currencyCode: 'VND',
    description: 'Ăn trưa',
    moneyJarId: 'jar-1',
    counterpartJarId: null,
    budgetId: 'tag-1',
    tags: ['khac'],
    transactionDate: new Date('2026-07-01'),
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinancialTransactionsService(
      transactionsRepository as any,
      jarsRepository as any,
      dataSource as any,
      financeNotificationService as any,
    );
    jarsRepository.ensureDefaultTagsForJar.mockResolvedValue([makeTag()]);
  });

  describe('createTransaction (ghi nhận thu chi)', () => {
    it('rejects a transaction dated in the future', async () => {
      await expect(
        service.createTransaction('user-1', {
          moneyJarId: 'jar-1',
          amount: 50000,
          type: FinancialRecordType.EXPENSE,
          transactionDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the target jar does not belong to the user', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.createTransaction('user-1', {
          moneyJarId: 'jar-unknown',
          amount: 50000,
          type: FinancialRecordType.EXPENSE,
          transactionDate: new Date().toISOString(),
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects transferring a jar to itself', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());

      await expect(
        service.createTransaction('user-1', {
          moneyJarId: 'jar-1',
          counterpartJarId: 'jar-1',
          amount: 50000,
          type: FinancialRecordType.EXPENSE,
          transactionDate: new Date().toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('records a regular expense and updates the jar balance', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      transactionsRepository.createTransaction.mockResolvedValue(makeTransaction());
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());

      const result = await service.createTransaction('user-1', {
        moneyJarId: 'jar-1',
        amount: 100000,
        type: FinancialRecordType.EXPENSE,
        description: 'Ăn trưa',
        transactionDate: new Date().toISOString(),
      } as any);

      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
      expect(result.amount).toBe(100000);
      expect(financeNotificationService.checkJarThresholdNotifications).toHaveBeenCalled();
    });

    it('creates paired expense/income records for a transfer between two jars', async () => {
      jarsRepository.findUserJarById.mockImplementation((_userId: string, jarId: string) =>
        Promise.resolve(makeJar({ id: jarId })),
      );
      transactionsRepository.createTransaction
        .mockResolvedValueOnce(makeTransaction({ id: 'tx-expense', type: FinancialRecordType.EXPENSE }))
        .mockResolvedValueOnce(makeTransaction({ id: 'tx-income', type: FinancialRecordType.INCOME }));
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ id: 'tx-expense', counterpartJarId: 'jar-2' }),
      );

      const result = await service.createTransaction('user-1', {
        moneyJarId: 'jar-1',
        counterpartJarId: 'jar-2',
        amount: 200000,
        type: FinancialRecordType.EXPENSE,
        transactionDate: new Date().toISOString(),
      } as any);

      expect(transactionsRepository.createTransaction).toHaveBeenCalledTimes(2);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-2');
      expect(result.id).toBe('tx-expense');
    });

    it('logs but does not fail the request when the threshold/budget notification calls reject', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      transactionsRepository.createTransaction.mockResolvedValue(makeTransaction());
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      financeNotificationService.checkJarThresholdNotifications.mockRejectedValueOnce(new Error('threshold down'));
      financeNotificationService.checkBudgetNotifications.mockRejectedValueOnce(new Error('budget down'));

      const result = await service.createTransaction('user-1', {
        moneyJarId: 'jar-1',
        amount: 100000,
        type: FinancialRecordType.EXPENSE,
        transactionDate: new Date().toISOString(),
      } as any);

      // Let the fire-and-forget .catch() handlers run before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.amount).toBe(100000);
    });
  });

  describe('getTransactionById', () => {
    it('throws NotFoundException when the transaction does not belong to the user', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(null);

      await expect(service.getTransactionById('user-1', 'tx-x')).rejects.toThrow(NotFoundException);
    });

    it('returns the mapped transaction when found', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());

      const result = await service.getTransactionById('user-1', 'tx-1');

      expect(result.id).toBe('tx-1');
    });
  });

  describe('distributeIncome (phân bổ thu nhập vào 6 lọ)', () => {
    it('rejects an income dated in the future', async () => {
      await expect(
        service.distributeIncome('user-1', {
          amount: 1000000,
          transactionDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          jarAllocations: [{ jarId: 'jar-1', amount: 1000000 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when jar allocations do not sum to the income amount', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());

      await expect(
        service.distributeIncome('user-1', {
          amount: 1000000,
          transactionDate: new Date().toISOString(),
          jarAllocations: [{ jarId: 'jar-1', amount: 400000 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('falls back to default jar percentages when no allocation is provided', async () => {
      jarsRepository.findActiveUserJars.mockResolvedValue([
        makeJar({ id: 'jar-1', percentage: 60 }),
        makeJar({ id: 'jar-2', percentage: 40 }),
      ]);
      jarsRepository.findUserJarById.mockImplementation((_userId: string, jarId: string) =>
        Promise.resolve(makeJar({ id: jarId })),
      );
      transactionsRepository.createTransaction.mockImplementation((payload: any) =>
        Promise.resolve(makeTransaction({ id: `tx-${payload.moneyJarId}`, moneyJarId: payload.moneyJarId, amount: payload.amount })),
      );
      transactionsRepository.findTransactionById.mockImplementation((_userId: string, txId: string) =>
        Promise.resolve(makeTransaction({ id: txId })),
      );

      const result = await service.distributeIncome('user-1', {
        amount: 1000000,
        transactionDate: new Date().toISOString(),
        jarAllocations: [],
      } as any);

      expect(result).toHaveLength(2);
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledTimes(2);
    });

    it('distributes income across the explicitly provided jar allocations', async () => {
      jarsRepository.findUserJarById.mockImplementation((_userId: string, jarId: string) =>
        Promise.resolve(makeJar({ id: jarId })),
      );
      transactionsRepository.createTransaction.mockImplementation((payload: any) =>
        Promise.resolve(makeTransaction({ id: `tx-${payload.moneyJarId}`, moneyJarId: payload.moneyJarId, amount: payload.amount })),
      );
      transactionsRepository.findTransactionById.mockImplementation((_userId: string, txId: string) =>
        Promise.resolve(makeTransaction({ id: txId })),
      );

      const result = await service.distributeIncome('user-1', {
        amount: 1000000,
        transactionDate: new Date().toISOString(),
        jarAllocations: [
          { jarId: 'jar-1', amount: 600000 },
          { jarId: 'jar-2', amount: 400000 },
        ],
      } as any);

      expect(result).toHaveLength(2);
      expect(transactionsRepository.createTransaction).toHaveBeenCalledTimes(2);
    });

    it('rejects the default allocation when the user has no active jars', async () => {
      jarsRepository.findActiveUserJars.mockResolvedValue([]);

      await expect(
        service.distributeIncome('user-1', {
          amount: 1000000,
          transactionDate: new Date().toISOString(),
          jarAllocations: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when an explicitly provided jar allocation does not belong to the user', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.distributeIncome('user-1', {
          amount: 1000000,
          transactionDate: new Date().toISOString(),
          jarAllocations: [{ jarId: 'jar-unknown', amount: 1000000 }],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('adds small (<1) remainders to the highest-allocated jar', async () => {
      jarsRepository.findUserJarById.mockImplementation((_userId: string, jarId: string) =>
        Promise.resolve(makeJar({ id: jarId })),
      );
      transactionsRepository.createTransaction.mockImplementation((payload: any) =>
        Promise.resolve(makeTransaction({ id: `tx-${payload.moneyJarId}`, moneyJarId: payload.moneyJarId, amount: payload.amount })),
      );
      transactionsRepository.findTransactionById.mockImplementation((_userId: string, txId: string) =>
        Promise.resolve(makeTransaction({ id: txId })),
      );

      const result = await service.distributeIncome('user-1', {
        amount: 1000000.5,
        transactionDate: new Date().toISOString(),
        jarAllocations: [
          { jarId: 'jar-1', amount: 999999.9 },
          { jarId: 'jar-2', amount: 0.6 },
        ],
      } as any);

      expect(result).toHaveLength(1);
      expect(transactionsRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ moneyJarId: 'jar-1', amount: 1000000.5 }),
      );
    });

    it('gives the full amount to the highest-percentage jar when every allocation is under 1', async () => {
      jarsRepository.findUserJarById.mockImplementation((_userId: string, jarId: string) =>
        Promise.resolve(makeJar({ id: jarId })),
      );
      transactionsRepository.createTransaction.mockImplementation((payload: any) =>
        Promise.resolve(makeTransaction({ id: `tx-${payload.moneyJarId}`, moneyJarId: payload.moneyJarId, amount: payload.amount })),
      );
      transactionsRepository.findTransactionById.mockImplementation((_userId: string, txId: string) =>
        Promise.resolve(makeTransaction({ id: txId })),
      );

      const result = await service.distributeIncome('user-1', {
        amount: 0.9,
        transactionDate: new Date().toISOString(),
        jarAllocations: [
          { jarId: 'jar-1', amount: 0.5 },
          { jarId: 'jar-2', amount: 0.4 },
        ],
      } as any);

      expect(result).toHaveLength(1);
      expect(transactionsRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 0.9 }),
      );
    });
  });

  describe('updateTransaction', () => {
    it('rejects updating a transaction that does not exist', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(null);

      await expect(
        service.updateTransaction('user-1', 'tx-missing', { amount: 10000 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects editing a transfer transaction (must delete and recreate instead)', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ counterpartJarId: 'jar-2' }),
      );

      await expect(
        service.updateTransaction('user-1', 'tx-1', { amount: 10000 } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects moving a transaction to a jar that does not belong to the user', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(
        service.updateTransaction('user-1', 'tx-1', { moneyJarId: 'jar-unknown' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the amount and recalculates the jar balance when the jar is unchanged', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      transactionsRepository.updateTransaction.mockResolvedValue(1);

      await service.updateTransaction('user-1', 'tx-1', { amount: 150000 } as any);

      expect(transactionsRepository.updateTransaction).toHaveBeenCalledWith(
        'tx-1',
        'user-1',
        expect.objectContaining({ amount: 150000 }),
      );
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
    });

    it('recalculates both jar balances when the transaction is moved to a different jar', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ id: 'jar-2' }));
      transactionsRepository.updateTransaction.mockResolvedValue(1);

      await service.updateTransaction('user-1', 'tx-1', { moneyJarId: 'jar-2' } as any);

      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-2');
    });

    it('rejects an updated transactionDate that is in the future', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());

      await expect(
        service.updateTransaction('user-1', 'tx-1', {
          transactionDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates every provided field in a single call', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      transactionsRepository.updateTransaction.mockResolvedValue(1);
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ id: 'jar-1' }));
      jarsRepository.findJarTagById.mockResolvedValue(makeTag({ id: 'tag-2', moneyJar: { id: 'jar-1' } }));

      await service.updateTransaction('user-1', 'tx-1', {
        type: FinancialRecordType.INCOME,
        amount: 250000,
        currencyCode: 'USD',
        description: 'Cập nhật mô tả',
        transactionDate: new Date().toISOString(),
        tags: ['tag-a'],
        notes: 'ghi chú',
        budgetId: 'tag-2',
      } as any);

      expect(transactionsRepository.updateTransaction).toHaveBeenCalledWith(
        'tx-1',
        'user-1',
        expect.objectContaining({
          type: FinancialRecordType.INCOME,
          amount: 250000,
          currencyCode: 'USD',
          description: 'Cập nhật mô tả',
          transactionDate: expect.any(Date),
          notes: 'ghi chú',
        }),
      );
    });

    it('throws NotFoundException when the repository update affects no rows', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());
      transactionsRepository.updateTransaction.mockResolvedValue(0);

      await expect(
        service.updateTransaction('user-1', 'tx-1', { amount: 150000 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTransaction', () => {
    it('rejects deleting a transaction that does not exist', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(null);

      await expect(
        service.deleteTransaction('user-1', 'tx-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the transaction and recalculates the jar balance', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction());

      await service.deleteTransaction('user-1', 'tx-1');

      expect(transactionsRepository.deleteTransaction).toHaveBeenCalledWith('tx-1');
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
    });

    it('also resyncs the budget spent amount when the deleted transaction was an expense', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ type: FinancialRecordType.EXPENSE }),
      );

      await service.deleteTransaction('user-1', 'tx-1');

      expect(jarsRepository.updateBudgetSpentFromTransactions).toHaveBeenCalledWith('jar-1');
    });

    it('does not resync the budget when the deleted transaction was income', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ type: FinancialRecordType.INCOME }),
      );

      await service.deleteTransaction('user-1', 'tx-1');

      expect(jarsRepository.updateBudgetSpentFromTransactions).not.toHaveBeenCalled();
    });

    it('also deletes the paired transfer transaction and recalculates the counterpart jar', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ counterpartJarId: 'jar-2' }),
      );
      dataSource.getRepository.mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 'tx-2' }),
      });

      await service.deleteTransaction('user-1', 'tx-1');

      expect(transactionsRepository.deleteTransaction).toHaveBeenCalledWith('tx-2');
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-2');
    });

    it('recalculates the counterpart jar balance even when the paired transaction cannot be found', async () => {
      transactionsRepository.findTransactionById.mockResolvedValue(
        makeTransaction({ counterpartJarId: 'jar-2' }),
      );
      dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      await service.deleteTransaction('user-1', 'tx-1');

      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-2');
    });
  });

  describe('getTransactions', () => {
    it('maps repository transactions to response domain with pagination', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({
        transactions: [makeTransaction()],
        total: 1,
      });

      const result = await service.getTransactions('user-1', { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 'tx-1', amount: 100000 });
      expect(result.total_pages).toBe(1);
    });

    it('defaults page/limit when not provided', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({ transactions: [], total: 0 });

      const result = await service.getTransactions('user-1', {} as any);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('resolveTransactionTag (qua createTransaction với budgetId)', () => {
    it('rejects when the requested budgetId does not belong to the transaction jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      jarsRepository.findJarTagById.mockResolvedValue(makeTag({ moneyJar: { id: 'jar-other' } }));

      await expect(
        service.createTransaction('user-1', {
          moneyJarId: 'jar-1',
          budgetId: 'tag-1',
          type: FinancialRecordType.EXPENSE,
          amount: 50000,
          transactionDate: new Date().toISOString(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses the requested tag when it belongs to the transaction jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      jarsRepository.findJarTagById.mockResolvedValue(makeTag({ id: 'tag-custom', moneyJar: { id: 'jar-1' } }));
      transactionsRepository.createTransaction.mockResolvedValue(makeTransaction({ budgetId: 'tag-custom' }));
      transactionsRepository.findTransactionById.mockResolvedValue(makeTransaction({ budgetId: 'tag-custom' }));

      await service.createTransaction('user-1', {
        moneyJarId: 'jar-1',
        budgetId: 'tag-custom',
        type: FinancialRecordType.INCOME,
        amount: 50000,
        transactionDate: new Date().toISOString(),
      } as any);

      expect(transactionsRepository.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ budgetId: 'tag-custom' }),
      );
    });
  });

  describe('getAggregatedTransactions', () => {
    const makeAggTx = (overrides: Record<string, any> = {}) => ({
      type: FinancialRecordType.EXPENSE,
      amount: '100000',
      transactionDate: new Date('2026-07-15T00:00:00.000Z'),
      counterpartJarId: null,
      ...overrides,
    });

    it('excludes jar-transfer transactions (those with a counterpartJarId) from totals', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({
        transactions: [
          makeAggTx({ counterpartJarId: 'jar-2', amount: '999999' }),
          makeAggTx({ type: FinancialRecordType.INCOME, amount: '500000' }),
        ],
      });

      const result = await service.getAggregatedTransactions('user-1', {
        period: 'month',
        startDate: '2026-07-01',
      } as any);

      expect(result.totalIncome).toBe(500000);
      expect(result.totalExpense).toBe(0);
    });

    it('aggregates by month and fills all 12 months of the target year', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({
        transactions: [makeAggTx({ amount: '200000' })],
      });

      const result = await service.getAggregatedTransactions('user-1', {
        period: 'month',
        startDate: '2026-01-01',
      } as any);

      expect(result.data).toHaveLength(12);
      const july = result.data.find((d) => d.period === '2026-07');
      expect(july?.expense).toBe(200000);
      expect(result.totalExpense).toBe(200000);
      expect(result.netAmount).toBe(-200000);
    });

    it('aggregates by week and fills all weeks of the target month', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({
        transactions: [makeAggTx({ amount: '150000', transactionDate: new Date('2026-07-15T00:00:00.000Z') })],
      });

      const result = await service.getAggregatedTransactions('user-1', {
        period: 'week',
        startDate: '2026-07-01',
      } as any);

      // July 2026 has 31 days -> ceil(31/7) = 5 weeks
      expect(result.data).toHaveLength(5);
      const week3 = result.data.find((d) => d.period === '2026-07-W3');
      expect(week3?.expense).toBe(150000);
    });

    it('defaults to month period when not specified', async () => {
      transactionsRepository.findTransactions.mockResolvedValue({ transactions: [] });

      const result = await service.getAggregatedTransactions('user-1', {} as any);

      expect(result.period).toBe('month');
    });
  });
});
