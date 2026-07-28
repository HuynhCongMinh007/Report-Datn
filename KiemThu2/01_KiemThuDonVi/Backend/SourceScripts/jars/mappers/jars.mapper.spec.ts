import { JarsMapper } from './jars.mapper';
import { FinancialRecordType } from '@/database/entities';

describe('JarsMapper', () => {
  const makeJar = (overrides: Record<string, any> = {}) => ({
    id: 'jar-1',
    categoryType: 'essentials',
    name: 'Thiết yếu',
    description: 'Chi tiêu thiết yếu',
    icon: 'Utensils',
    color: '#3B82F6',
    isSystem: true,
    percentage: '55.00', // TypeORM returns decimals as strings
    isActive: true,
    sortOrder: 1,
    currentBalance: '1500000.00',
    accumulatedIncome: '2000000.00',
    accumulatedExpense: '500000.00',
    notificationSetting: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  describe('toJarDomain', () => {
    it('parses decimal string fields into numbers', () => {
      const result = JarsMapper.toJarDomain(makeJar() as any);

      expect(result.current_balance).toBe(1500000);
      expect(result.accumulated_income).toBe(2000000);
      expect(result.accumulated_expense).toBe(500000);
      expect(result.percentage).toBe(55);
    });

    it('derives allocated/spent/remaining from accumulated income/expense and current balance', () => {
      const result = JarsMapper.toJarDomain(makeJar() as any);

      expect(result.allocated).toBe(2000000);
      expect(result.spent).toBe(500000);
      expect(result.remaining).toBe(1500000);
    });

    it('falls back to 0 for missing/invalid numeric fields', () => {
      const result = JarsMapper.toJarDomain(
        makeJar({ currentBalance: null, accumulatedIncome: undefined, accumulatedExpense: 'not-a-number', percentage: null }) as any,
      );

      expect(result.current_balance).toBe(0);
      expect(result.accumulated_income).toBe(0);
      expect(result.accumulated_expense).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it('defaults code to "other" when categoryType is missing', () => {
      const result = JarsMapper.toJarDomain(makeJar({ categoryType: null }) as any);

      expect(result.code).toBe('other');
    });

    it('defaults is_enabled to true when isActive is null/undefined', () => {
      const result = JarsMapper.toJarDomain(makeJar({ isActive: undefined }) as any);

      expect(result.is_enabled).toBe(true);
    });

    it('maps notification_setting when present', () => {
      const result = JarsMapper.toJarDomain(
        makeJar({
          notificationSetting: {
            id: 'notif-1',
            moneyJarId: 'jar-1',
            percentEnabled: true,
            percentValue: 80,
            amountEnabled: false,
            amountValue: null,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        }) as any,
      );

      expect(result.notification_setting).toMatchObject({ id: 'notif-1', percentValue: 80 });
    });

    it('leaves notification_setting undefined when absent', () => {
      const result = JarsMapper.toJarDomain(makeJar({ notificationSetting: null }) as any);

      expect(result.notification_setting).toBeUndefined();
    });
  });

  describe('toJarDetailDomain', () => {
    const makeJarDetail = (transactions: any[] = []) => ({
      id: 'jar-1',
      categoryType: 'essentials',
      name: 'Thiết yếu',
      description: 'Chi tiêu thiết yếu',
      icon: 'Utensils',
      color: '#3B82F6',
      percentage: '55.00',
      isActive: true,
      transactions,
    });

    it('aggregates income and expense transactions separately', () => {
      const jar = makeJarDetail([
        { type: FinancialRecordType.INCOME, amount: '1000000' },
        { type: FinancialRecordType.INCOME, amount: '500000' },
        { type: FinancialRecordType.EXPENSE, amount: '300000' },
      ]);

      const result = JarsMapper.toJarDetailDomain(jar as any);

      expect(result.income_amount).toBe(1500000);
      expect(result.expense_amount).toBe(300000);
      expect(result.total_amount).toBe(1200000);
      expect(result.transaction_count).toBe(3);
    });

    it('returns zeroed totals when there are no transactions', () => {
      const jar = makeJarDetail([]);

      const result = JarsMapper.toJarDetailDomain(jar as any);

      expect(result.income_amount).toBe(0);
      expect(result.expense_amount).toBe(0);
      expect(result.total_amount).toBe(0);
      expect(result.transaction_count).toBe(0);
    });

    it('defaults code to "other" when categoryType is missing', () => {
      const jar = makeJarDetail([]);
      jar.categoryType = null as any;

      const result = JarsMapper.toJarDetailDomain(jar as any);

      expect(result.code).toBe('other');
    });
  });
});
