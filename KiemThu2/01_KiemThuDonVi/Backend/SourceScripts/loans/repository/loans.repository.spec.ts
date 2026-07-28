import { LoanRepository } from './loans.repository';
import { LoanStatus } from '@/database/entities/loans/user-loan.entity';

// Chainable stub for TypeORM's SelectQueryBuilder — supports the subset of methods
// LoanRepository actually uses (leftJoinAndSelect/where/andWhere/orderBy/skip/take/
// getMany/getCount/getOne, plus the update/set/execute chain used by cancelUserLoan).
function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take', 'update', 'set'].forEach(
    (method) => {
      qb[method] = jest.fn().mockReturnValue(qb);
    },
  );
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  qb.getCount = jest.fn().mockResolvedValue(overrides.getCount ?? 0);
  qb.getOne = jest.fn().mockResolvedValue(overrides.getOne ?? null);
  qb.execute = jest.fn().mockResolvedValue(overrides.execute ?? { affected: 0 });
  return qb;
}

describe('LoanRepository', () => {
  let repository: LoanRepository;

  const userLoanRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const loanPackageRepository = {
    createQueryBuilder: jest.fn(),
  };
  const userLoanRepaymentRepository = {};
  const userLoanDocumentRepository = {};

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new LoanRepository(
      userLoanRepository as any,
      loanPackageRepository as any,
      userLoanRepaymentRepository as any,
      userLoanDocumentRepository as any,
    );
  });

  describe('findLoanPackages', () => {
    it('applies pagination and returns data with computed meta', async () => {
      const qb = makeQueryBuilderMock({ getCount: 5, getMany: [{ id: 'package-1' }] });
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findLoanPackages({ page: 2, limit: 2 } as any);

      expect(qb.skip).toHaveBeenCalledWith(2);
      expect(qb.take).toHaveBeenCalledWith(2);
      expect(result.data).toEqual([{ id: 'package-1' }]);
      expect(result.meta).toEqual({
        total: 5,
        per_page: 2,
        current_page: 2,
        total_pages: 3,
        from: 3,
        to: 4,
      });
    });

    it('applies search filter as a bracketed OR clause when search is provided', async () => {
      const qb = makeQueryBuilderMock();
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findLoanPackages({ page: 1, limit: 20, search: 'student' } as any);

      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(Object));
    });

    it('applies known filter keys (loan_type, provider_id, interest_type, collateral_required)', async () => {
      const qb = makeQueryBuilderMock();
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findLoanPackages({
        page: 1,
        limit: 20,
        filter: [
          { key: 'loan_type', value: 'STUDENT' },
          { key: 'provider_id', value: 'provider-1' },
          { key: 'interest_type', value: 'fixed' },
          { key: 'collateral_required', value: 'true' },
          { key: 'unknown_key', value: 'x' },
        ],
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('loan_package.loan_type = :loan_type', {
        loan_type: 'STUDENT',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('loan_package.provider_id = :provider_id', {
        provider_id: 'provider-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('loan_package.interest_type = :interest_type', {
        interest_type: 'fixed',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'loan_package.collateral_required = :collateral_required',
        { collateral_required: true },
      );
    });

    it('defaults to page 1 / limit 20 when neither is provided', async () => {
      const qb = makeQueryBuilderMock({ getCount: 0, getMany: [] });
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findLoanPackages({} as any);

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.meta.current_page).toBe(1);
      expect(result.meta.per_page).toBe(20);
    });

    it('ignores filters with a missing key or value', async () => {
      const qb = makeQueryBuilderMock();
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      await repository.findLoanPackages({
        page: 1,
        limit: 20,
        filter: [{ key: 'loan_type' }, { value: 'STUDENT' }],
      } as any);

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('loan_type'),
        expect.anything(),
      );
    });
  });

  describe('findLoanPackageById', () => {
    it('returns the loan package when found', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'package-1' } });
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findLoanPackageById('package-1');

      expect(qb.where).toHaveBeenCalledWith('loan_package.id = :id', { id: 'package-1' });
      expect(result).toEqual({ id: 'package-1' });
    });

    it('returns null when the loan package does not exist', async () => {
      const qb = makeQueryBuilderMock({ getOne: null });
      loanPackageRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findLoanPackageById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findUserLoans', () => {
    it('scopes the query to the given userId and computes pagination meta', async () => {
      const qb = makeQueryBuilderMock({ getCount: 1, getMany: [{ id: 'user-loan-1' }] });
      userLoanRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserLoans('user-1', { page: 1, limit: 20 } as any);

      expect(qb.where).toHaveBeenCalledWith('user_loan.user_id = :userId', { userId: 'user-1' });
      expect(result.data).toEqual([{ id: 'user-loan-1' }]);
      expect(result.meta.total).toBe(1);
    });

    it('defaults to page 1 / limit 20 when neither is provided', async () => {
      const qb = makeQueryBuilderMock({ getCount: 0, getMany: [] });
      userLoanRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserLoans('user-1', {} as any);

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.meta.current_page).toBe(1);
    });
  });

  describe('createUserLoan', () => {
    it('creates a user loan defaulting principal/term to package min values when not provided', async () => {
      const loanPackage = {
        id: 'package-1',
        providerId: 'provider-1',
        packageName: 'Vay tín chấp sinh viên',
        loanType: 'STUDENT',
        minAmount: 1000000,
        interestRate: 8.5,
        interestType: 'FIXED',
        minTermMonths: 6,
      };
      userLoanRepository.create.mockImplementation((entity) => entity);
      userLoanRepository.save.mockImplementation((entity) => Promise.resolve({ id: 'user-loan-1', ...entity }));

      const result = await repository.createUserLoan('user-1', loanPackage as any, {} as any);

      expect(userLoanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          loanPackageId: 'package-1',
          principalAmount: 1000000,
          termMonths: 6,
          status: LoanStatus.PENDING,
        }),
      );
      expect(result).toMatchObject({ id: 'user-loan-1' });
    });

    it('uses the requested principal/term when provided in the dto', async () => {
      const loanPackage = {
        id: 'package-1',
        providerId: 'provider-1',
        packageName: 'Vay tín chấp sinh viên',
        loanType: 'STUDENT',
        minAmount: 1000000,
        interestRate: 8.5,
        interestType: 'FIXED',
        minTermMonths: 6,
      };
      userLoanRepository.create.mockImplementation((entity) => entity);
      userLoanRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      await repository.createUserLoan(
        'user-1',
        loanPackage as any,
        { principal_amount: 20000000, term_months: 24 } as any,
      );

      expect(userLoanRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ principalAmount: 20000000, termMonths: 24 }),
      );
    });
  });

  describe('findUserLoanById', () => {
    it('scopes the query to both id and userId', async () => {
      const qb = makeQueryBuilderMock({ getOne: { id: 'user-loan-1' } });
      userLoanRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findUserLoanById('user-loan-1', 'user-1');

      expect(qb.where).toHaveBeenCalledWith('user_loan.id = :id', { id: 'user-loan-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('user_loan.user_id = :userId', { userId: 'user-1' });
      expect(result).toEqual({ id: 'user-loan-1' });
    });
  });

  describe('cancelUserLoan', () => {
    it('returns true when a row was affected (cancellable pending loan found)', async () => {
      const qb = makeQueryBuilderMock({ execute: { affected: 1 } });
      userLoanRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.cancelUserLoan('user-loan-1', 'user-1');

      expect(qb.set).toHaveBeenCalledWith({ status: LoanStatus.CANCELLED });
      expect(qb.andWhere).toHaveBeenCalledWith('status = :status', { status: LoanStatus.PENDING });
      expect(result).toBe(true);
    });

    it('returns false when no row was affected (already cancelled/not pending)', async () => {
      const qb = makeQueryBuilderMock({ execute: { affected: 0 } });
      userLoanRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.cancelUserLoan('user-loan-1', 'user-1');

      expect(result).toBe(false);
    });
  });
});
