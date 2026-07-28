import { JarsRepository } from './jars.repository';
import { FinancialRecordType } from '@/database/entities/financial/financial-transaction.entity';
import { PeriodType } from '@/database/entities/financial/budget.entity';
import { JarType } from '../dtos/get-jars.dto';

// Chainable stub for TypeORM's SelectQueryBuilder covering the subset of methods used
// across JarsRepository's more complex queries (joins/filters/aggregation/pagination).
function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  [
    'leftJoinAndSelect',
    'leftJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'select',
    'addSelect',
    'skip',
    'take',
  ].forEach((method) => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  qb.getOne = jest.fn().mockResolvedValue(overrides.getOne ?? null);
  qb.getRawOne = jest.fn().mockResolvedValue(overrides.getRawOne ?? null);
  qb.getRawMany = jest.fn().mockResolvedValue(overrides.getRawMany ?? []);
  qb.getCount = jest.fn().mockResolvedValue(overrides.getCount ?? 0);
  return qb;
}

describe('JarsRepository', () => {
  let repository: JarsRepository;

  const moneyJarRepository = {
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const budgetRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const financialTransactionRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const jarNotificationSettingRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new JarsRepository(
      moneyJarRepository as any,
      budgetRepository as any,
      financialTransactionRepository as any,
      jarNotificationSettingRepository as any,
    );
  });

  describe('findJarsForUser', () => {
    it('excludes inactive jars by default (includeDisabled=false)', async () => {
      const qb = makeQueryBuilderMock();
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarsForUser('user-1', { includeDisabled: false } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('jar.isActive = :isActive', { isActive: true });
    });

    it('includes inactive jars when includeDisabled is true', async () => {
      const qb = makeQueryBuilderMock();
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarsForUser('user-1', { includeDisabled: true } as any);

      expect(qb.andWhere).not.toHaveBeenCalledWith('jar.isActive = :isActive', expect.anything());
    });

    it('filters to system jars only when type=SYSTEM', async () => {
      const qb = makeQueryBuilderMock();
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarsForUser('user-1', { includeDisabled: true, type: JarType.SYSTEM } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('jar.isSystem = :isSystem', { isSystem: true });
    });

    it('filters to custom jars only when type=CUSTOM', async () => {
      const qb = makeQueryBuilderMock();
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarsForUser('user-1', { includeDisabled: true, type: JarType.CUSTOM } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('jar.isSystem = :isSystem', { isSystem: false });
    });
  });

  describe('getJarStats', () => {
    it('computes remainingAmount as allocated minus spent for a month with a budget', async () => {
      const budgetQb = makeQueryBuilderMock({ getOne: { amount: '5000000' } });
      const txQb = makeQueryBuilderMock({
        getMany: [{ amount: '1000000' }, { amount: '500000' }],
      });
      budgetRepository.createQueryBuilder.mockReturnValue(budgetQb);
      financialTransactionRepository.createQueryBuilder.mockReturnValue(txQb);

      const result = await repository.getJarStats('user-1', 'jar-1', '2026-07');

      expect(result).toEqual({
        allocatedAmount: 5000000,
        spentAmount: 1500000,
        remainingAmount: 3500000,
        transactionCount: 2,
      });
    });

    it('defaults allocatedAmount to 0 when no budget exists for the month', async () => {
      const budgetQb = makeQueryBuilderMock({ getOne: null });
      const txQb = makeQueryBuilderMock({ getMany: [] });
      budgetRepository.createQueryBuilder.mockReturnValue(budgetQb);
      financialTransactionRepository.createQueryBuilder.mockReturnValue(txQb);

      const result = await repository.getJarStats('user-1', 'jar-1', '2026-07');

      expect(result.allocatedAmount).toBe(0);
      expect(result.remainingAmount).toBe(0);
    });
  });

  describe('updateJarBalanceFromTransactions', () => {
    it('computes accumulated income/expense and current balance from grouped raw results', async () => {
      const qb = makeQueryBuilderMock({
        getRawMany: [
          { type: FinancialRecordType.INCOME, total: '3000000' },
          { type: FinancialRecordType.EXPENSE, total: '1200000' },
        ],
      });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.updateJarBalanceFromTransactions('jar-1');

      expect(moneyJarRepository.update).toHaveBeenCalledWith('jar-1', {
        currentBalance: 1800000,
        accumulatedIncome: 3000000,
        accumulatedExpense: 1200000,
      });
    });

    it('defaults both accumulators to 0 when there are no transactions', async () => {
      const qb = makeQueryBuilderMock({ getRawMany: [] });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.updateJarBalanceFromTransactions('jar-1');

      expect(moneyJarRepository.update).toHaveBeenCalledWith('jar-1', {
        currentBalance: 0,
        accumulatedIncome: 0,
        accumulatedExpense: 0,
      });
    });
  });

  describe('updateBudgetSpentFromTransactions', () => {
    it('does nothing when the jar has no active, non-tag budget for the current period', async () => {
      budgetRepository.findOne.mockResolvedValue(null);

      await repository.updateBudgetSpentFromTransactions('jar-1');

      expect(financialTransactionRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(budgetRepository.update).not.toHaveBeenCalled();
    });

    it('scopes the budget lookup to isTag:false so it never matches a per-jar tag row', async () => {
      budgetRepository.findOne.mockResolvedValue(null);

      await repository.updateBudgetSpentFromTransactions('jar-1');

      expect(budgetRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isTag: false, isActive: true }),
        }),
      );
    });

    it('recalculates spentAmount and remainingAmount from expense transactions in the budget period', async () => {
      budgetRepository.findOne.mockResolvedValue({
        id: 'budget-1',
        amount: '2000000',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      });
      const qb = makeQueryBuilderMock({ getRawOne: { total: '1500000' } });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.updateBudgetSpentFromTransactions('jar-1');

      expect(budgetRepository.update).toHaveBeenCalledWith('budget-1', {
        spentAmount: 1500000,
        remainingAmount: 500000,
      });
    });

    it('treats a null aggregation total as 0 spent', async () => {
      budgetRepository.findOne.mockResolvedValue({
        id: 'budget-1',
        amount: '2000000',
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
      });
      const qb = makeQueryBuilderMock({ getRawOne: { total: null } });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.updateBudgetSpentFromTransactions('jar-1');

      expect(budgetRepository.update).toHaveBeenCalledWith('budget-1', {
        spentAmount: 0,
        remainingAmount: 2000000,
      });
    });
  });

  describe('getJarStatistics', () => {
    it('returns null when the jar does not exist for the user', async () => {
      const jarQb = makeQueryBuilderMock({ getOne: null });
      moneyJarRepository.createQueryBuilder.mockReturnValue(jarQb);

      const result = await repository.getJarStatistics('user-1', 'jar-1');

      expect(result).toBeNull();
    });

    it('aggregates income/expense totals, counts, and the latest transaction date', async () => {
      const jar: any = { id: 'jar-1' };
      const jarQb = makeQueryBuilderMock({ getOne: jar });
      moneyJarRepository.createQueryBuilder.mockReturnValue(jarQb);

      const txQb = makeQueryBuilderMock({
        getMany: [
          { type: FinancialRecordType.INCOME, amount: '1000000', transactionDate: new Date('2026-07-01') },
          { type: FinancialRecordType.EXPENSE, amount: '300000', transactionDate: new Date('2026-07-10') },
          { type: FinancialRecordType.EXPENSE, amount: '200000', transactionDate: new Date('2026-07-05') },
        ],
      });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(txQb);

      const result = await repository.getJarStatistics('user-1', 'jar-1');

      expect(result.totalIncome).toBe(1000000);
      expect(result.totalExpense).toBe(500000);
      expect(result.incomeCount).toBe(1);
      expect(result.expenseCount).toBe(2);
      expect(result.transactionCount).toBe(3);
      expect(result.avgTransactionAmount).toBeCloseTo(500000);
      expect(result.lastTransactionDate).toEqual(new Date('2026-07-10'));
    });

    it('returns zeroed stats when the jar has no transactions', async () => {
      const jar: any = { id: 'jar-1' };
      moneyJarRepository.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getOne: jar }));
      financialTransactionRepository.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getMany: [] }));

      const result = await repository.getJarStatistics('user-1', 'jar-1');

      expect(result.transactionCount).toBe(0);
      expect(result.avgTransactionAmount).toBe(0);
      expect(result.lastTransactionDate).toBeUndefined();
    });
  });

  describe('getJarChartData', () => {
    it('returns null when the jar does not exist for the user', async () => {
      moneyJarRepository.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getOne: null }));

      const result = await repository.getJarChartData('user-1', 'jar-1');

      expect(result).toBeNull();
    });

    it('groups transactions by month into income/expense buckets', async () => {
      const jar: any = { id: 'jar-1' };
      moneyJarRepository.createQueryBuilder.mockReturnValue(makeQueryBuilderMock({ getOne: jar }));
      financialTransactionRepository.createQueryBuilder.mockReturnValue(
        makeQueryBuilderMock({
          getMany: [
            { type: FinancialRecordType.INCOME, amount: '1000000', transactionDate: new Date('2026-06-15') },
            { type: FinancialRecordType.EXPENSE, amount: '200000', transactionDate: new Date('2026-06-20') },
            { type: FinancialRecordType.EXPENSE, amount: '300000', transactionDate: new Date('2026-07-01') },
          ],
        }),
      );

      const result = await repository.getJarChartData('user-1', 'jar-1');

      expect(result.monthlyData.get('2026-06')).toEqual({ income: 1000000, expense: 200000 });
      expect(result.monthlyData.get('2026-07')).toEqual({ income: 0, expense: 300000 });
    });
  });

  describe('findJarTransactions', () => {
    it('applies pagination and returns transactions with total count', async () => {
      const qb = makeQueryBuilderMock({ getCount: 45, getMany: [{ id: 'tx-1' }] });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findJarTransactions('user-1', 'jar-1', undefined, undefined, 2, 20);

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({ transactions: [{ id: 'tx-1' }], total: 45 });
    });

    it('applies startDate/endDate filters only when provided', async () => {
      const qb = makeQueryBuilderMock({ getCount: 0, getMany: [] });
      financialTransactionRepository.createQueryBuilder.mockReturnValue(qb);
      const startDate = new Date('2026-07-01');
      const endDate = new Date('2026-07-31');

      await repository.findJarTransactions('user-1', 'jar-1', startDate, endDate);

      expect(qb.andWhere).toHaveBeenCalledWith('transaction.transactionDate >= :startDate', { startDate });
      expect(qb.andWhere).toHaveBeenCalledWith('transaction.transactionDate <= :endDate', { endDate });
    });
  });

  describe('slugifyTagName', () => {
    it('normalizes Vietnamese diacritics and spacing into a URL-safe slug', () => {
      expect(repository.slugifyTagName('Ăn uống')).toBe('an-uong');
      expect(repository.slugifyTagName('Điện nước')).toBe('dien-nuoc');
    });

    it('falls back to "khac" when the normalized name has no valid characters', () => {
      expect(repository.slugifyTagName('!!!')).toBe('khac');
    });
  });

  describe('ensureDefaultTagsForJar', () => {
    it('only creates default tags that do not already exist for the jar', async () => {
      const jar: any = { id: 'jar-1', categoryType: 'essentials' };
      const existingTagsQb = makeQueryBuilderMock({
        getMany: [{ slug: 'an-uong', sortOrder: 0 }],
      });
      budgetRepository.createQueryBuilder.mockReturnValue(existingTagsQb);
      budgetRepository.create.mockImplementation((data) => data);
      budgetRepository.save.mockImplementation((data) => Promise.resolve({ ...data, sortOrder: data.sortOrder ?? 0 }));

      const result = await repository.ensureDefaultTagsForJar('user-1', jar);

      // 'Ăn uống' -> 'an-uong' already exists, should not be recreated
      const createdSlugs = budgetRepository.create.mock.calls.map((call) => call[0].slug);
      expect(createdSlugs).not.toContain('an-uong');
      expect(createdSlugs).toContain('tien-nha');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('findUserJarById / findActiveUserJars / findJarById / findUserJarByName / findUserJarByCode / findJarAllocations', () => {
    it('findUserJarById returns the jar for the given user', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserJarById('user-1', 'jar-1');

      expect(result).toEqual({ id: 'jar-1' });
    });

    it('findActiveUserJars returns only active, non-deleted jars', async () => {
      const qb = makeQueryBuilderMock({ getMany: [{ id: 'jar-1' }] });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findActiveUserJars('user-1');

      expect(result).toEqual([{ id: 'jar-1' }]);
    });

    it('findJarById returns the system jar for the given user', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-system' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findJarById('user-1');

      expect(result).toEqual({ id: 'jar-system' });
    });

    it('findUserJarByName looks up case-insensitively', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1', name: 'Ăn uống' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserJarByName('user-1', 'ăn uống');

      expect(result).toEqual({ id: 'jar-1', name: 'Ăn uống' });
    });

    it('findUserJarByCode looks up by categoryType', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1', categoryType: 'essentials' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserJarByCode('user-1', 'essentials');

      expect(result).toEqual({ id: 'jar-1', categoryType: 'essentials' });
    });

    it('findJarAllocations returns id/name/percentage for each active jar, defaulting missing percentages to 0', async () => {
      const qb = makeQueryBuilderMock({
        getMany: [
          { id: 'jar-1', name: 'Thiết yếu', percentage: '55' },
          { id: 'jar-2', name: 'Giải trí', percentage: null },
        ],
      });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findJarAllocations('user-1');

      expect(result).toEqual([
        { id: 'jar-1', name: 'Thiết yếu', percentage: 55 },
        { id: 'jar-2', name: 'Giải trí', percentage: 0 },
      ]);
    });
  });

  describe('findUserJarByIdOrCode', () => {
    it('returns the jar found by ID when the input is a valid UUID', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: '11111111-1111-1111-1111-111111111111' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserJarByIdOrCode(
        'user-1',
        '11111111-1111-1111-1111-111111111111',
      );

      expect(result).toEqual({ id: '11111111-1111-1111-1111-111111111111' });
    });

    it('falls back to lookup by code when the UUID is well-formed but not found', async () => {
      const byIdQb = makeQueryBuilderMock({ getOne: null });
      const byCodeQb = makeQueryBuilderMock({ getOne: { id: 'jar-1', categoryType: 'essentials' } });
      moneyJarRepository.createQueryBuilder
        .mockReturnValueOnce(byIdQb)
        .mockReturnValueOnce(byCodeQb);

      const result = await repository.findUserJarByIdOrCode(
        'user-1',
        '11111111-1111-1111-1111-111111111111',
      );

      expect(result).toEqual({ id: 'jar-1', categoryType: 'essentials' });
    });

    it('looks up directly by code when the input is not a UUID', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1', categoryType: 'essentials' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserJarByIdOrCode('user-1', 'essentials');

      expect(moneyJarRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'jar-1', categoryType: 'essentials' });
    });
  });

  describe('createUserJar / updateUserJar / deleteUserJar / createJarDeletionTransfer', () => {
    it('createUserJar saves a new custom jar with the given fields', async () => {
      moneyJarRepository.create.mockImplementation((data: any) => data);
      moneyJarRepository.save.mockImplementation((data: any) => Promise.resolve({ id: 'jar-new', ...data }));

      const result = await repository.createUserJar('user-1', 'Tiết kiệm', 'desc', 'icon', 'color', 'savings');

      expect(result).toMatchObject({ name: 'Tiết kiệm', categoryType: 'savings', isSystem: false });
    });

    it('updateUserJar updates the jar then returns the refreshed record', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1', name: 'Đã đổi tên' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.updateUserJar('jar-1', 'user-1', { name: 'Đã đổi tên' } as any);

      expect(moneyJarRepository.update).toHaveBeenCalledWith(
        'jar-1',
        expect.objectContaining({ name: 'Đã đổi tên' }),
      );
      expect(result).toEqual({ id: 'jar-1', name: 'Đã đổi tên' });
    });

    it('deleteUserJar returns false when the jar does not belong to the user', async () => {
      const qb = makeQueryBuilderMock({ getOne: null });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.deleteUserJar('jar-x', 'user-1');

      expect(result).toBe(false);
      expect(moneyJarRepository.update).not.toHaveBeenCalled();
    });

    it('deleteUserJar soft-deletes and returns true when found', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'jar-1' } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.deleteUserJar('jar-1', 'user-1');

      expect(moneyJarRepository.update).toHaveBeenCalledWith('jar-1', { isActive: false, isDeleted: true });
      expect(result).toBe(true);
    });

    it('createJarDeletionTransfer saves paired expense/income transactions', async () => {
      financialTransactionRepository.create.mockImplementation((data: any) => data);
      financialTransactionRepository.save.mockResolvedValue(undefined);

      await repository.createJarDeletionTransfer('jar-1', 'jar-2', 100000, 'user-1', 'Từ', 'Đến');

      expect(financialTransactionRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({ moneyJarId: 'jar-1', type: FinancialRecordType.EXPENSE }),
        expect.objectContaining({ moneyJarId: 'jar-2', type: FinancialRecordType.INCOME }),
      ]);
    });
  });

  describe('getJarStats', () => {
    it('defaults allocatedAmount to 0 when no budget exists for the month', async () => {
      const budgetQb = makeQueryBuilderMock({ getOne: null });
      const txQb = makeQueryBuilderMock({ getMany: [{ amount: 50000 }] });
      budgetRepository.createQueryBuilder.mockReturnValue(budgetQb);
      financialTransactionRepository.createQueryBuilder.mockReturnValue(txQb);

      const result = await repository.getJarStats('user-1', 'jar-1', '2026-07');

      expect(result).toEqual({
        allocatedAmount: 0,
        spentAmount: 50000,
        remainingAmount: -50000,
        transactionCount: 1,
      });
    });

    it('uses the budget amount as allocatedAmount when a budget exists', async () => {
      const budgetQb = makeQueryBuilderMock({ getOne: { amount: 2000000 } });
      const txQb = makeQueryBuilderMock({ getMany: [{ amount: 500000 }] });
      budgetRepository.createQueryBuilder.mockReturnValue(budgetQb);
      financialTransactionRepository.createQueryBuilder.mockReturnValue(txQb);

      const result = await repository.getJarStats('user-1', 'jar-1', '2026-07');

      expect(result).toEqual({
        allocatedAmount: 2000000,
        spentAmount: 500000,
        remainingAmount: 1500000,
        transactionCount: 1,
      });
    });
  });

  describe('findJarTags', () => {
    it('excludes deleted tags by default', async () => {
      const qb = makeQueryBuilderMock({ getMany: [] });
      budgetRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarTags('user-1', 'jar-1');

      expect(qb.andWhere).toHaveBeenCalledWith('tag.isDeleted = :isDeleted', { isDeleted: false });
    });

    it('includes deleted tags when includeDeleted=true', async () => {
      const qb = makeQueryBuilderMock({ getMany: [] });
      budgetRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findJarTags('user-1', 'jar-1', true);

      expect(qb.andWhere).not.toHaveBeenCalledWith('tag.isDeleted = :isDeleted', { isDeleted: false });
    });
  });

  describe('createJar', () => {
    it('applies default icon/color/categoryType/percentage/sortOrder when no additional data is given', async () => {
      const qb = makeQueryBuilderMock({ getRawOne: null });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);
      moneyJarRepository.save.mockImplementation((jar: any) => Promise.resolve(jar));

      const result = await repository.createJar('user-1', { name: 'Học tập' });

      expect(result).toMatchObject({
        name: 'Học tập',
        description: '',
        icon: 'Target',
        color: '#3B82F6',
        categoryType: 'other',
        percentage: 0,
        sortOrder: 1,
      });
    });

    it('uses the provided additional data and continues the existing sortOrder sequence', async () => {
      const qb = makeQueryBuilderMock({ getRawOne: { maxSortOrder: 3 } });
      moneyJarRepository.createQueryBuilder.mockReturnValue(qb);
      moneyJarRepository.save.mockImplementation((jar: any) => Promise.resolve(jar));

      const result = await repository.createJar(
        'user-1',
        { name: 'Đầu tư', description: 'Quỹ đầu tư' },
        { categoryType: 'investment', icon: 'TrendingUp', color: '#22C55E', percentage: 10 },
      );

      expect(result).toMatchObject({
        name: 'Đầu tư',
        description: 'Quỹ đầu tư',
        icon: 'TrendingUp',
        color: '#22C55E',
        categoryType: 'investment',
        percentage: 10,
        sortOrder: 4,
      });
    });
  });

  describe('upsertNotificationSetting', () => {
    it('updates an existing notification setting', async () => {
      jarNotificationSettingRepository.findOne.mockResolvedValue({ id: 'setting-1', jarId: 'jar-1' });

      const result = await repository.upsertNotificationSetting('jar-1', { thresholdPercent: 80 } as any);

      expect(jarNotificationSettingRepository.update).toHaveBeenCalledWith('setting-1', { thresholdPercent: 80 });
      expect(result).toMatchObject({ id: 'setting-1', thresholdPercent: 80 });
    });

    it('creates a new notification setting when none exists', async () => {
      jarNotificationSettingRepository.findOne.mockResolvedValue(null);
      jarNotificationSettingRepository.create.mockImplementation((data: any) => data);
      jarNotificationSettingRepository.save.mockImplementation((data: any) => Promise.resolve({ id: 'setting-new', ...data }));

      const result = await repository.upsertNotificationSetting('jar-1', { thresholdPercent: 80 } as any);

      expect(jarNotificationSettingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ thresholdPercent: 80, moneyJarId: 'jar-1' }),
      );
      expect(result).toMatchObject({ id: 'setting-new', thresholdPercent: 80 });
    });
  });
});
