import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { LOANS_CONST } from './constants/loans.constant';
import { LoanStatus } from '@/database/entities/loans/user-loan.entity';

describe('LoansService', () => {
  let service: LoansService;

  const loanRepository = {
    findLoanPackages: jest.fn(),
    findLoanPackageById: jest.fn(),
    findUserLoans: jest.fn(),
    createUserLoan: jest.fn(),
    findUserLoanById: jest.fn(),
    cancelUserLoan: jest.fn(),
  };

  const makeLoanPackage = (overrides: Record<string, any> = {}) => ({
    id: 'package-1',
    packageName: 'Vay tín chấp sinh viên',
    description: 'Gói vay ưu đãi cho sinh viên',
    imageUrl: null,
    loanType: 'STUDENT',
    minAmount: 1000000,
    maxAmount: 50000000,
    minTermMonths: 6,
    maxTermMonths: 36,
    interestRate: 8.5,
    interestType: 'FIXED',
    eligibilityCriteria: 'Sinh viên năm 3 trở lên',
    requiredDocuments: 'CMND, Giấy xác nhận sinh viên',
    repaymentMethod: 'MONTHLY',
    collateralRequired: false,
    providerId: 'provider-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    provider: { id: 'provider-1', name: 'Ngân hàng CSXH', logoUrl: null },
    ...overrides,
  });

  const makeUserLoan = (overrides: Record<string, any> = {}) => ({
    id: 'user-loan-1',
    loanPackageId: 'package-1',
    loanName: 'Vay tín chấp sinh viên',
    loanCode: 'LOAN-123',
    loanType: 'STUDENT',
    principalAmount: 10000000,
    interestRate: 8.5,
    interestType: 'FIXED',
    currencyCode: 'VND',
    termMonths: 12,
    startDate: new Date('2026-01-01'),
    dueDate: new Date('2027-01-01'),
    status: LoanStatus.PENDING,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    provider: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoansService(loanRepository as any);
  });

  describe('getLoans', () => {
    it('maps repository data through LoansMapper and returns meta as-is', async () => {
      const meta = { total: 1, per_page: 20, current_page: 1, total_pages: 1, from: 1, to: 1 };
      loanRepository.findLoanPackages.mockResolvedValue({ data: [makeLoanPackage()], meta });

      const result = await service.getLoans({ page: 1, limit: 20 } as any);

      expect(result.meta).toBe(meta);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 'package-1', package_name: 'Vay tín chấp sinh viên' });
    });

    it('returns an empty list when repository has no data', async () => {
      const meta = { total: 0, per_page: 20, current_page: 1, total_pages: 0, from: 1, to: 0 };
      loanRepository.findLoanPackages.mockResolvedValue({ data: [], meta });

      const result = await service.getLoans({ page: 1, limit: 20 } as any);

      expect(result.data).toEqual([]);
    });
  });

  describe('getLoanDetail', () => {
    it('returns mapped loan package detail when found', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(makeLoanPackage());

      const result = await service.getLoanDetail('package-1');

      expect(result).toMatchObject({
        id: 'package-1',
        interest_rate: 8.5,
        provider: { id: 'provider-1', name: 'Ngân hàng CSXH' },
      });
    });

    it('throws NotFoundException when loan package does not exist', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(null);

      await expect(service.getLoanDetail('missing')).rejects.toThrow(NotFoundException);
      await expect(service.getLoanDetail('missing')).rejects.toThrow(
        LOANS_CONST.LOAN_PACKAGE_NOT_FOUND,
      );
    });
  });

  describe('registerLoan', () => {
    it('throws NotFoundException when loan package does not exist', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(null);

      await expect(
        service.registerLoan('user-1', { loan_package_id: 'missing' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(loanRepository.createUserLoan).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when principal amount is below package minimum', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(makeLoanPackage());

      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          principal_amount: 500000,
        } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          principal_amount: 500000,
        } as any),
      ).rejects.toThrow(LOANS_CONST.PRINCIPAL_AMOUNT_TOO_LOW);
    });

    it('throws BadRequestException when principal amount exceeds package maximum', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(makeLoanPackage());

      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          principal_amount: 100000000,
        } as any),
      ).rejects.toThrow(LOANS_CONST.PRINCIPAL_AMOUNT_TOO_HIGH);
    });

    it('throws BadRequestException when term months is below package minimum', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(makeLoanPackage());

      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          term_months: 1,
        } as any),
      ).rejects.toThrow(LOANS_CONST.TERM_MONTHS_TOO_LOW);
    });

    it('throws BadRequestException when term months exceeds package maximum', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(makeLoanPackage());

      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          term_months: 60,
        } as any),
      ).rejects.toThrow(LOANS_CONST.TERM_MONTHS_TOO_HIGH);
    });

    it('skips min/max validation when package does not define those bounds', async () => {
      loanRepository.findLoanPackageById.mockResolvedValue(
        makeLoanPackage({ minAmount: null, maxAmount: null, minTermMonths: null, maxTermMonths: null }),
      );
      loanRepository.createUserLoan.mockResolvedValue(makeUserLoan());

      await expect(
        service.registerLoan('user-1', {
          loan_package_id: 'package-1',
          principal_amount: 999999999,
          term_months: 999,
        } as any),
      ).resolves.toBeDefined();
    });

    it('creates the user loan and returns mapped domain on happy path', async () => {
      const loanPackage = makeLoanPackage();
      loanRepository.findLoanPackageById.mockResolvedValue(loanPackage);
      loanRepository.createUserLoan.mockResolvedValue(makeUserLoan());

      const dto = { loan_package_id: 'package-1', principal_amount: 10000000, term_months: 12 } as any;
      const result = await service.registerLoan('user-1', dto);

      expect(loanRepository.createUserLoan).toHaveBeenCalledWith('user-1', loanPackage, dto);
      expect(result).toMatchObject({ id: 'user-loan-1', loan_code: 'LOAN-123', status: LoanStatus.PENDING });
    });
  });

  describe('getUserLoans', () => {
    it('maps repository data and passes through meta', async () => {
      const meta = { total: 1, per_page: 20, current_page: 1, total_pages: 1, from: 1, to: 1 };
      loanRepository.findUserLoans.mockResolvedValue({ data: [makeUserLoan()], meta });

      const result = await service.getUserLoans('user-1', { page: 1, limit: 20 } as any);

      expect(result.meta).toBe(meta);
      expect(result.data[0]).toMatchObject({ id: 'user-loan-1' });
    });
  });

  describe('getUserLoansDetail', () => {
    it('returns mapped user loan when found', async () => {
      loanRepository.findUserLoanById.mockResolvedValue(makeUserLoan());

      const result = await service.getUserLoansDetail('user-1', { id: 'user-loan-1' } as any);

      expect(result).toMatchObject({ id: 'user-loan-1' });
    });

    // NOTE: unlike unregisterLoan, this method does not check for null before mapping.
    // This documents the CURRENT behavior (a raw TypeError from the mapper) rather than a
    // graceful NotFoundException — flagged as a pre-existing bug candidate, not fixed here.
    it('throws a raw error instead of NotFoundException when the user loan does not exist', async () => {
      loanRepository.findUserLoanById.mockResolvedValue(null);

      await expect(
        service.getUserLoansDetail('user-1', { id: 'missing' } as any),
      ).rejects.toThrow();
    });
  });

  describe('unregisterLoan', () => {
    it('throws NotFoundException when the user loan does not exist', async () => {
      loanRepository.findUserLoanById.mockResolvedValue(null);

      await expect(service.unregisterLoan('user-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(loanRepository.cancelUserLoan).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the loan cannot be cancelled', async () => {
      loanRepository.findUserLoanById.mockResolvedValue(makeUserLoan());
      loanRepository.cancelUserLoan.mockResolvedValue(false);

      await expect(service.unregisterLoan('user-1', 'user-loan-1')).rejects.toThrow(ConflictException);
      await expect(service.unregisterLoan('user-1', 'user-loan-1')).rejects.toThrow(
        LOANS_CONST.CANNOT_CANCEL_LOAN,
      );
    });

    it('resolves without error when the loan is cancelled successfully', async () => {
      loanRepository.findUserLoanById.mockResolvedValue(makeUserLoan());
      loanRepository.cancelUserLoan.mockResolvedValue(true);

      await expect(service.unregisterLoan('user-1', 'user-loan-1')).resolves.toBeUndefined();
    });
  });
});
