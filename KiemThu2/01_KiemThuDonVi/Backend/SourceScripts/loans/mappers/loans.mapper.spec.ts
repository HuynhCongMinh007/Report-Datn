import { LoansMapper } from './loans.mapper';
import { LoanStatus } from '@/database/entities/loans/user-loan.entity';

describe('LoansMapper', () => {
  const makeLoanPackage = (overrides: Record<string, any> = {}) => ({
    id: 'package-1',
    packageName: 'Vay tín chấp sinh viên',
    description: 'Gói vay ưu đãi',
    imageUrl: 'https://example.com/image.png',
    loanType: 'STUDENT',
    minAmount: 1000000,
    maxAmount: 50000000,
    minTermMonths: 6,
    maxTermMonths: 36,
    interestRate: 8.5,
    interestType: 'FIXED',
    eligibilityCriteria: 'Sinh viên năm 3',
    requiredDocuments: 'CMND',
    repaymentMethod: 'MONTHLY',
    collateralRequired: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    provider: { id: 'provider-1', name: 'Ngân hàng CSXH', logoUrl: 'https://example.com/logo.png' },
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
    notes: 'ghi chú',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    provider: {
      id: 'provider-1',
      name: 'Ngân hàng CSXH',
      logoUrl: 'https://example.com/logo.png',
      contactEmail: 'contact@bank.vn',
    },
    ...overrides,
  });

  describe('toGetLoansDomain', () => {
    it('maps entity fields to snake_case domain fields', () => {
      const result = LoansMapper.toGetLoansDomain(makeLoanPackage() as any);

      expect(result).toEqual({
        id: 'package-1',
        package_name: 'Vay tín chấp sinh viên',
        description: 'Gói vay ưu đãi',
        image_url: 'https://example.com/image.png',
        loan_type: 'STUDENT',
        min_amount: 1000000,
        max_amount: 50000000,
        min_term_months: 6,
        max_term_months: 36,
      });
    });
  });

  describe('toGetLoanDetailDomain', () => {
    it('maps extended detail fields and nested provider', () => {
      const result = LoansMapper.toGetLoanDetailDomain(makeLoanPackage() as any);

      expect(result).toMatchObject({
        id: 'package-1',
        interest_rate: 8.5,
        eligibility_criteria: 'Sinh viên năm 3',
        required_documents: 'CMND',
        repayment_method: 'MONTHLY',
        collateral_required: false,
        provider: { id: 'provider-1', name: 'Ngân hàng CSXH', logo_url: 'https://example.com/logo.png' },
      });
    });

    it('leaves provider undefined when the loan package has no provider', () => {
      const result = LoansMapper.toGetLoanDetailDomain(makeLoanPackage({ provider: null }) as any);

      expect(result.provider).toBeUndefined();
    });
  });

  describe('toUserLoanDomain', () => {
    it('maps user loan fields and nested provider with contact email', () => {
      const result = LoansMapper.toUserLoanDomain(makeUserLoan() as any);

      expect(result).toMatchObject({
        id: 'user-loan-1',
        loan_code: 'LOAN-123',
        principal_amount: 10000000,
        status: LoanStatus.PENDING,
        provider: {
          id: 'provider-1',
          name: 'Ngân hàng CSXH',
          contact_email: 'contact@bank.vn',
        },
      });
    });

    it('leaves provider undefined when the user loan has no provider', () => {
      const result = LoansMapper.toUserLoanDomain(makeUserLoan({ provider: null }) as any);

      expect(result.provider).toBeUndefined();
    });

    it('passes through optional fields as undefined when absent', () => {
      const result = LoansMapper.toUserLoanDomain(
        makeUserLoan({ loanPackageId: undefined, notes: undefined, provider: null }) as any,
      );

      expect(result.loan_package_id).toBeUndefined();
      expect(result.notes).toBeUndefined();
    });
  });
});
