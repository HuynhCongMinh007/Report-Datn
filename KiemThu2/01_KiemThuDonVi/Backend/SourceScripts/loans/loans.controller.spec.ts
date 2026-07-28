import { HttpStatus } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LOANS_CONST } from './constants/loans.constant';

describe('LoansController', () => {
  let controller: LoansController;

  const loansService = {
    getLoans: jest.fn(),
    getLoanDetail: jest.fn(),
    registerLoan: jest.fn(),
    getUserLoans: jest.fn(),
    getUserLoansDetail: jest.fn(),
    unregisterLoan: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LoansController(loansService as any);
  });

  describe('getLoans', () => {
    it('calls service.getLoans with the query dto and wraps data+meta in the success envelope', async () => {
      const meta = { total: 1, per_page: 20, current_page: 1, total_pages: 1, from: 1, to: 1 };
      const data = [{ id: 'package-1' }];
      loansService.getLoans.mockResolvedValue({ data, meta });

      const dto = { page: 1, limit: 20 } as any;
      const result = await controller.getLoans(dto);

      expect(loansService.getLoans).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({
        message: LOANS_CONST.GET_LOANS_SUCCESS,
        code: HttpStatus.OK,
        data,
        meta,
      });
    });
  });

  describe('getLoanDetail', () => {
    it('calls service.getLoanDetail with the id param and wraps result', async () => {
      const data = { id: 'package-1' };
      loansService.getLoanDetail.mockResolvedValue(data);

      const result = await controller.getLoanDetail({ id: 'package-1' } as any);

      expect(loansService.getLoanDetail).toHaveBeenCalledWith('package-1');
      expect(result).toMatchObject({
        message: LOANS_CONST.GET_LOAN_DETAIL_SUCCESS,
        code: HttpStatus.OK,
        data,
      });
    });
  });

  describe('registerLoan', () => {
    it('calls service.registerLoan with the current userId and body, returns 201', async () => {
      const data = { id: 'user-loan-1' };
      loansService.registerLoan.mockResolvedValue(data);

      const dto = { loan_package_id: 'package-1' } as any;
      const result = await controller.registerLoan(dto, 'user-1');

      expect(loansService.registerLoan).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({
        message: LOANS_CONST.REGISTER_LOAN_SUCCESS,
        code: HttpStatus.CREATED,
        data,
      });
    });
  });

  describe('getUserLoans', () => {
    it('calls service.getUserLoans with userId and query dto', async () => {
      const meta = { total: 0, per_page: 20, current_page: 1, total_pages: 0, from: 1, to: 0 };
      loansService.getUserLoans.mockResolvedValue({ data: [], meta });

      const dto = { page: 1, limit: 20 } as any;
      const result = await controller.getUserLoans(dto, 'user-1');

      expect(loansService.getUserLoans).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ message: LOANS_CONST.GET_USER_LOANS_SUCCESS, data: [], meta });
    });
  });

  describe('getUserLoansDetail', () => {
    it('calls service.getUserLoansDetail with userId and id param', async () => {
      const data = { id: 'user-loan-1' };
      loansService.getUserLoansDetail.mockResolvedValue(data);

      const dto = { id: 'user-loan-1' } as any;
      const result = await controller.getUserLoansDetail(dto, 'user-1');

      expect(loansService.getUserLoansDetail).toHaveBeenCalledWith('user-1', dto);
      expect(result).toMatchObject({ message: LOANS_CONST.GET_USER_LOAN_DETAIL_SUCCESS, data });
    });
  });

  describe('unregisterLoan', () => {
    it('calls service.unregisterLoan with userId and id, returns success envelope with no data', async () => {
      loansService.unregisterLoan.mockResolvedValue(undefined);

      const dto = { id: 'user-loan-1' } as any;
      const result = await controller.unregisterLoan(dto, 'user-1');

      expect(loansService.unregisterLoan).toHaveBeenCalledWith('user-1', 'user-loan-1');
      expect(result).toMatchObject({ message: LOANS_CONST.UNREGISTER_LOAN_SUCCESS, code: HttpStatus.OK });
    });
  });
});
