import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JarsService } from './jars.service';
import { JARS_CONST } from './constants/jars.constant';

describe('JarsService', () => {
  let service: JarsService;

  const jarsRepository = {
    findJarById: jest.fn(),
    createDefaultSystemJarCategories: jest.fn(),
    findJarsForUser: jest.fn(),
    findUserJarByName: jest.fn(),
    createJar: jest.fn(),
    findUserJarById: jest.fn(),
    updateUserJar: jest.fn(),
    findActiveUserJars: jest.fn(),
    deleteUserJar: jest.fn(),
    findUserJarByIdOrCode: jest.fn(),
    findJarTagBySlug: jest.fn(),
    createJarTag: jest.fn(),
    findJarTagById: jest.fn(),
    updateJarTag: jest.fn(),
    softDeleteJarTag: jest.fn(),
    ensureDefaultTagsForJar: jest.fn(),
    findJarTransactions: jest.fn(),
    updateJarBalanceFromTransactions: jest.fn(),
    updateMultipleJarsBalance: jest.fn(),
    getJarStatistics: jest.fn(),
    getJarChartData: jest.fn(),
    createJarDeletionTransfer: jest.fn(),
    findNotificationSettingByJarId: jest.fn(),
    upsertNotificationSetting: jest.fn(),
    slugifyTagName: jest.fn((name: string) =>
      name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'),
    ),
  };

  const makeJar = (overrides: Record<string, any> = {}) => ({
    id: 'jar-1',
    name: 'Thiết yếu',
    categoryType: 'essentials',
    icon: 'Utensils',
    color: '#3B82F6',
    percentage: 55,
    currentBalance: 0,
    isSystem: true,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JarsService(jarsRepository as any);
  });

  describe('createJar (thiết lập cấu hình 6 lọ)', () => {
    it('rejects when jar name already exists for the user', async () => {
      jarsRepository.findUserJarByName.mockResolvedValue(makeJar());

      await expect(
        service.createJar('user-1', { name: 'Thiết yếu' } as any),
      ).rejects.toThrow(ConflictException);
      expect(jarsRepository.createJar).not.toHaveBeenCalled();
    });

    it('creates a new custom jar when name is unique', async () => {
      jarsRepository.findUserJarByName.mockResolvedValue(null);
      jarsRepository.createJar.mockResolvedValue(
        makeJar({ id: 'jar-new', name: 'Du lịch', isSystem: false }),
      );

      const result = await service.createJar('user-1', {
        name: 'Du lịch',
        description: 'Quỹ du lịch',
        categoryType: 'custom',
        icon: 'Plane',
        color: '#00FF00',
      } as any);

      expect(jarsRepository.createJar).toHaveBeenCalledWith(
        'user-1',
        { name: 'Du lịch', description: 'Quỹ du lịch' },
        { categoryType: 'custom', icon: 'Plane', color: '#00FF00' },
      );
      expect(result.name).toBe('Du lịch');
    });
  });

  describe('updateJarPercentages (thiết lập tỷ lệ 6 lọ)', () => {
    it('rejects when total percentage is not 100', async () => {
      await expect(
        service.updateJarPercentages('user-1', {
          jars: [
            { categoryId: 'jar-1', percentage: 60 },
            { categoryId: 'jar-2', percentage: 30 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(jarsRepository.updateUserJar).not.toHaveBeenCalled();
    });

    it('rejects when one of the jars does not belong to the user', async () => {
      jarsRepository.findUserJarById
        .mockResolvedValueOnce(makeJar({ id: 'jar-1' }))
        .mockResolvedValueOnce(null);

      await expect(
        service.updateJarPercentages('user-1', {
          jars: [
            { categoryId: 'jar-1', percentage: 60 },
            { categoryId: 'jar-2', percentage: 40 },
          ],
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(jarsRepository.updateUserJar).not.toHaveBeenCalled();
    });

    it('updates all jars when total percentage equals 100', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      jarsRepository.updateUserJar.mockResolvedValue(makeJar());

      await service.updateJarPercentages('user-1', {
        jars: [
          { categoryId: 'jar-1', percentage: 60 },
          { categoryId: 'jar-2', percentage: 40 },
        ],
      } as any);

      expect(jarsRepository.updateUserJar).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateJarAllocations (cấu hình phân bổ lọ)', () => {
    it('rejects when total allocation percentage is not 100', async () => {
      await expect(
        service.updateJarAllocations('user-1', {
          allocations: [{ id: 'jar-1', name: 'Thiết yếu', percentage: 50 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects deleting a custom jar that still has balance', async () => {
      jarsRepository.findJarsForUser.mockResolvedValue([
        makeJar({ id: 'jar-1', isSystem: true }),
        makeJar({ id: 'jar-2', isSystem: false, currentBalance: 50000 }),
      ]);
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ id: 'jar-1' }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ id: 'jar-1' }));

      await expect(
        service.updateJarAllocations('user-1', {
          allocations: [{ id: 'jar-1', name: 'Thiết yếu', percentage: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(jarsRepository.deleteUserJar).not.toHaveBeenCalled();
    });

    it('creates a new custom jar and removes zero-balance jars no longer allocated', async () => {
      jarsRepository.findJarsForUser.mockResolvedValue([
        makeJar({ id: 'jar-old', isSystem: false, currentBalance: 0 }),
      ]);
      jarsRepository.createJar.mockResolvedValue(
        makeJar({ id: 'jar-new', name: 'Đầu tư', isSystem: false }),
      );
      jarsRepository.deleteUserJar.mockResolvedValue(true);
      jarsRepository.findJarById.mockResolvedValue(makeJar());
      jarsRepository.findActiveUserJars.mockResolvedValue([
        makeJar({ id: 'jar-new', name: 'Đầu tư', percentage: 100 }),
      ]);

      const result = await service.updateJarAllocations('user-1', {
        allocations: [
          { name: 'Đầu tư', percentage: 100, code: 'investment' },
        ],
      } as any);

      expect(jarsRepository.createJar).toHaveBeenCalled();
      expect(jarsRepository.deleteUserJar).toHaveBeenCalledWith('jar-old', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Đầu tư');
    });
  });

  describe('getJarAllocations', () => {
    it('bootstraps default system jars when user has none yet', async () => {
      jarsRepository.findJarById.mockResolvedValue(null);
      jarsRepository.findActiveUserJars.mockResolvedValue([makeJar()]);

      const result = await service.getJarAllocations('user-1');

      expect(jarsRepository.createDefaultSystemJarCategories).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        {
          id: 'jar-1',
          code: 'essentials',
          name: 'Thiết yếu',
          icon: 'Utensils',
          percentage: 55,
          color: '#3B82F6',
        },
      ]);
    });
  });

  describe('updateJar (bảo vệ hũ hệ thống)', () => {
    it('rejects renaming a system jar (only icon/color may change)', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: true }));

      await expect(
        service.updateJar('user-1', 'jar-1', { name: 'Tên mới' } as any),
      ).rejects.toThrow('System jars can only have their percentage, icon, and color modified');
    });

    it('allows changing icon/color of a system jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: true }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ icon: 'Star' }));

      const result = await service.updateJar('user-1', 'jar-1', { icon: 'Star' } as any);

      expect(result.icon).toBe('Star');
    });

    it('allows renaming a custom (non-system) jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: false }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ isSystem: false, name: 'Quỹ mới' }));

      const result = await service.updateJar('user-1', 'jar-1', { name: 'Quỹ mới' } as any);

      expect(result.name).toBe('Quỹ mới');
    });
  });

  describe('createJarTag / deleteJarTag (quản lý thẻ chi tiêu trong hũ)', () => {
    it('rejects creating a tag whose name already exists in the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTagBySlug.mockResolvedValue({ id: 'tag-1', slug: 'an-uong' });

      await expect(
        service.createJarTag('user-1', 'jar-1', { name: 'Ăn uống' } as any),
      ).rejects.toThrow(ConflictException);
      expect(jarsRepository.createJarTag).not.toHaveBeenCalled();
    });

    it('creates a new tag when the slug is unique within the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTagBySlug.mockResolvedValue(null);
      jarsRepository.createJarTag.mockResolvedValue({
        id: 'tag-new',
        name: 'Xăng xe',
        slug: 'xang-xe',
        moneyJar: makeJar(),
      });

      const result = await service.createJarTag('user-1', 'jar-1', { name: 'Xăng xe' } as any);

      expect(result.id).toBe('tag-new');
    });

    it('protects the default "Khác" tag from deletion', async () => {
      jarsRepository.findJarTagById.mockResolvedValue({ id: 'tag-khac', slug: 'khac', isDefault: true });

      await expect(service.deleteJarTag('user-1', 'tag-khac')).rejects.toThrow(BadRequestException);
      expect(jarsRepository.softDeleteJarTag).not.toHaveBeenCalled();
    });

    it('soft-deletes a non-default tag owned by the user', async () => {
      jarsRepository.findJarTagById.mockResolvedValue({ id: 'tag-1', slug: 'giai-tri', isDefault: false });

      await service.deleteJarTag('user-1', 'tag-1');

      expect(jarsRepository.softDeleteJarTag).toHaveBeenCalledWith('tag-1');
    });
  });

  describe('getJars', () => {
    it('bootstraps default system jars when the user has none yet, then returns mapped jars', async () => {
      jarsRepository.findJarById.mockResolvedValue(null);
      jarsRepository.createDefaultSystemJarCategories.mockResolvedValue(undefined);
      jarsRepository.findJarsForUser.mockResolvedValue([makeJar()]);

      const result = await service.getJars('user-1', {} as any);

      expect(jarsRepository.createDefaultSystemJarCategories).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });

    it('skips bootstrapping when the user already has a system jar', async () => {
      jarsRepository.findJarById.mockResolvedValue(makeJar());
      jarsRepository.findJarsForUser.mockResolvedValue([makeJar()]);

      await service.getJars('user-1', {} as any);

      expect(jarsRepository.createDefaultSystemJarCategories).not.toHaveBeenCalled();
    });

    it('wraps unexpected repository errors as InternalServerErrorException', async () => {
      jarsRepository.findJarById.mockRejectedValue(new Error('db down'));

      await expect(service.getJars('user-1', {} as any)).rejects.toThrow('Failed to retrieve jars');
    });
  });

  describe('getJarDetail', () => {
    it('returns mapped jar detail when found', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar({ transactions: [] }));

      const result = await service.getJarDetail('user-1', 'essentials');

      expect(result.id).toBe('jar-1');
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(service.getJarDetail('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getJarTags', () => {
    it('returns tags mapped to response DTOs', async () => {
      const jar = makeJar();
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(jar);
      jarsRepository.ensureDefaultTagsForJar.mockResolvedValue([
        { id: 'tag-1', name: 'Ăn uống', slug: 'an-uong', isDefault: false, sortOrder: 0, moneyJar: jar },
      ]);

      const result = await service.getJarTags('user-1', 'jar-1');

      expect(result).toEqual([
        expect.objectContaining({ id: 'tag-1', jarId: 'jar-1', name: 'Ăn uống' }),
      ]);
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(service.getJarTags('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateJarTag', () => {
    it('throws NotFoundException when the tag does not exist', async () => {
      jarsRepository.findJarTagById.mockResolvedValue(null);

      await expect(service.updateJarTag('user-1', 'missing', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('updates name/slug and rejects when the new slug collides with another tag in the jar', async () => {
      const jar = makeJar();
      const tag = { id: 'tag-1', slug: 'an-uong', moneyJar: jar };
      jarsRepository.findJarTagById.mockResolvedValue(tag);
      jarsRepository.findJarTagBySlug.mockResolvedValue({ id: 'tag-other', slug: 'giai-tri' });

      await expect(
        service.updateJarTag('user-1', 'tag-1', { name: 'Giải trí' } as any),
      ).rejects.toThrow(ConflictException);
      expect(jarsRepository.updateJarTag).not.toHaveBeenCalled();
    });

    it('applies the update and returns the refreshed tag when there is no slug collision', async () => {
      const jar = makeJar();
      const tag = { id: 'tag-1', slug: 'an-uong', moneyJar: jar };
      jarsRepository.findJarTagById
        .mockResolvedValueOnce(tag)
        .mockResolvedValueOnce({ ...tag, name: 'Ăn ngoài', slug: 'an-ngoai', moneyJar: jar });
      jarsRepository.findJarTagBySlug.mockResolvedValue(null);
      jarsRepository.updateJarTag.mockResolvedValue(undefined);

      const result = await service.updateJarTag('user-1', 'tag-1', { name: 'Ăn ngoài' } as any);

      expect(jarsRepository.updateJarTag).toHaveBeenCalledWith(
        'tag-1',
        expect.objectContaining({ name: 'Ăn ngoài', slug: 'an-ngoai' }),
      );
      expect(result.name).toBe('Ăn ngoài');
    });

    it('only updates description/sortOrder when name is not provided', async () => {
      const jar = makeJar();
      const tag = { id: 'tag-1', slug: 'an-uong', moneyJar: jar };
      jarsRepository.findJarTagById.mockResolvedValueOnce(tag).mockResolvedValueOnce(tag);
      jarsRepository.updateJarTag.mockResolvedValue(undefined);

      await service.updateJarTag('user-1', 'tag-1', { description: 'note', sortOrder: 2 } as any);

      expect(jarsRepository.updateJarTag).toHaveBeenCalledWith('tag-1', { description: 'note', sortOrder: 2 });
      expect(jarsRepository.findJarTagBySlug).not.toHaveBeenCalled();
    });
  });

  describe('getJarTransactions', () => {
    it('returns paginated transactions for the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTransactions.mockResolvedValue({
        transactions: [
          { id: 'tx-1', type: 'EXPENSE', amount: '50000', currencyCode: 'VND', createdAt: new Date() },
        ],
        total: 1,
      });

      const result = await service.getJarTransactions('user-1', 'jar-1', { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total_pages).toBe(1);
    });

    it('parses optional startDate/endDate query params into Date objects', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTransactions.mockResolvedValue({ transactions: [], total: 0 });

      await service.getJarTransactions('user-1', 'jar-1', {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      } as any);

      expect(jarsRepository.findJarTransactions).toHaveBeenCalledWith(
        'user-1',
        'jar-1',
        new Date('2026-07-01'),
        new Date('2026-07-31'),
        1,
        20,
      );
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(
        service.getJarTransactions('user-1', 'missing', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateJarBalance / recalculateAllUserJarsBalance', () => {
    it('recalculateJarBalance delegates to the repository for a single jar', async () => {
      await service.recalculateJarBalance('jar-1');

      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
    });

    it('recalculateAllUserJarsBalance recalculates every active jar of the user', async () => {
      jarsRepository.findActiveUserJars.mockResolvedValue([makeJar({ id: 'jar-1' }), makeJar({ id: 'jar-2' })]);

      await service.recalculateAllUserJarsBalance('user-1');

      expect(jarsRepository.updateMultipleJarsBalance).toHaveBeenCalledWith(['jar-1', 'jar-2']);
    });
  });

  describe('getJarStatistics', () => {
    it('returns mapped statistics when found', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.getJarStatistics.mockResolvedValue({
        jar: makeJar(),
        totalIncome: 1000000,
        totalExpense: 300000,
        transactionCount: 3,
        incomeCount: 1,
        expenseCount: 2,
        avgTransactionAmount: 433333,
        lastTransactionDate: new Date('2026-07-01'),
      });

      const result = await service.getJarStatistics('user-1', 'jar-1');

      expect(result.total_income).toBe(1000000);
      expect(result.transaction_count).toBe(3);
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(service.getJarStatistics('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the repository cannot compute statistics', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.getJarStatistics.mockResolvedValue(null);

      await expect(service.getJarStatistics('user-1', 'jar-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getJarChartData', () => {
    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(service.getJarChartData('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the repository returns no chart data', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.getJarChartData.mockResolvedValue(null);

      await expect(service.getJarChartData('user-1', 'jar-1')).rejects.toThrow(NotFoundException);
    });

    it('computes income/expense breakdown, monthly trend and top tag categories', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar({ currentBalance: 500000 }));
      const monthlyData = new Map<string, { income: number; expense: number }>();
      monthlyData.set('2026-06', { income: 1000000, expense: 400000 });
      monthlyData.set('2026-07', { income: 500000, expense: 200000 });
      jarsRepository.getJarChartData.mockResolvedValue({
        jar: makeJar(),
        transactions: [
          { type: 'income', amount: '1000000', tags: [] },
          { type: 'expense', amount: '300000', tags: ['an-uong'] },
          { type: 'expense', amount: '100000', tags: [] },
        ],
        monthlyData,
      });

      const result = await service.getJarChartData('user-1', 'jar-1');

      expect(result.income_expense_breakdown).toEqual([
        expect.objectContaining({ label: 'Income', value: 1000000 }),
        expect.objectContaining({ label: 'Expense', value: 400000 }),
      ]);
      expect(result.monthly_trend).toHaveLength(2);
      expect(result.monthly_trend[0].month).toBe('2026-06');
      expect(result.top_categories.map((c) => c.label)).toEqual(
        expect.arrayContaining(['an-uong', 'Other']),
      );
    });
  });

  describe('deleteUserJar', () => {
    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(null);

      await expect(service.deleteUserJar('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects deleting a system jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: true }));

      await expect(service.deleteUserJar('user-1', 'jar-1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes a zero-balance custom jar directly without requiring a transfer', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: false, currentBalance: 0 }));

      await service.deleteUserJar('user-1', 'jar-1');

      expect(jarsRepository.createJarDeletionTransfer).not.toHaveBeenCalled();
      expect(jarsRepository.deleteUserJar).toHaveBeenCalledWith('jar-1', 'user-1');
    });

    it('requires a transferToJarId when the jar being deleted still has a balance', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: false, currentBalance: 100000 }));

      await expect(service.deleteUserJar('user-1', 'jar-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects when the transfer destination jar does not exist', async () => {
      jarsRepository.findUserJarById
        .mockResolvedValueOnce(makeJar({ id: 'jar-1', isSystem: false, currentBalance: 100000 }))
        .mockResolvedValueOnce(null);

      await expect(service.deleteUserJar('user-1', 'jar-1', 'jar-2')).rejects.toThrow(NotFoundException);
    });

    it('rejects transferring the balance to the same jar being deleted', async () => {
      jarsRepository.findUserJarById
        .mockResolvedValueOnce(makeJar({ id: 'jar-1', isSystem: false, currentBalance: 100000 }))
        .mockResolvedValueOnce(makeJar({ id: 'jar-1', isSystem: false }));

      await expect(service.deleteUserJar('user-1', 'jar-1', 'jar-1')).rejects.toThrow(BadRequestException);
    });

    it('transfers the balance to the destination jar and recalculates both balances before deleting', async () => {
      jarsRepository.findUserJarById
        .mockResolvedValueOnce(makeJar({ id: 'jar-1', name: 'Giải trí', isSystem: false, currentBalance: 100000 }))
        .mockResolvedValueOnce(makeJar({ id: 'jar-2', name: 'Tiết kiệm', isSystem: false }));

      await service.deleteUserJar('user-1', 'jar-1', 'jar-2');

      expect(jarsRepository.createJarDeletionTransfer).toHaveBeenCalledWith(
        'jar-1', 'jar-2', 100000, 'user-1', 'Giải trí', 'Tiết kiệm',
      );
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-1');
      expect(jarsRepository.updateJarBalanceFromTransactions).toHaveBeenCalledWith('jar-2');
      expect(jarsRepository.deleteUserJar).toHaveBeenCalledWith('jar-1', 'user-1');
    });
  });

  describe('getJarNotificationSetting', () => {
    it('returns the existing notification setting when found', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findNotificationSettingByJarId.mockResolvedValue({ id: 'setting-1' });

      const result = await service.getJarNotificationSetting('user-1', 'jar-1');

      expect(result).toEqual({ id: 'setting-1' });
      expect(jarsRepository.upsertNotificationSetting).not.toHaveBeenCalled();
    });

    it('creates a default (disabled) setting when none exists yet', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findNotificationSettingByJarId.mockResolvedValue(null);
      jarsRepository.upsertNotificationSetting.mockResolvedValue({ id: 'setting-new', percentEnabled: false });

      const result = await service.getJarNotificationSetting('user-1', 'jar-1');

      expect(jarsRepository.upsertNotificationSetting).toHaveBeenCalledWith(
        'jar-1',
        expect.objectContaining({ percentEnabled: false, amountEnabled: false }),
      );
      expect(result).toEqual({ id: 'setting-new', percentEnabled: false });
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(service.getJarNotificationSetting('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateJarNotificationSetting', () => {
    it('upserts the notification setting for the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.upsertNotificationSetting.mockResolvedValue({ id: 'setting-1', percentEnabled: true });

      const result = await service.updateJarNotificationSetting('user-1', 'jar-1', { percentEnabled: true } as any);

      expect(jarsRepository.upsertNotificationSetting).toHaveBeenCalledWith('jar-1', { percentEnabled: true });
      expect(result).toEqual({ id: 'setting-1', percentEnabled: true });
    });

    it('throws NotFoundException when the jar does not exist', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(null);

      await expect(
        service.updateJarNotificationSetting('user-1', 'missing', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
