import { HttpStatus } from '@nestjs/common';
import { FinancialTransactionsController } from './financial-transactions.controller';
import { TRANSACTIONS_CONST } from './constants/transactions.constant';

describe('FinancialTransactionsController', () => {
  let controller: FinancialTransactionsController;

  const transactionsService = {
    getTransactions: jest.fn(),
    getAggregatedTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    createTransaction: jest.fn(),
    distributeIncome: jest.fn(),
    updateTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FinancialTransactionsController(transactionsService as any);
  });

  it('getTransactions delegates to service.getTransactions with query and userId', async () => {
    transactionsService.getTransactions.mockResolvedValue({ data: [], meta: {} });
    const dto = { page: 1, limit: 20 } as any;

    const result = await controller.getTransactions(dto, 'user-1');

    expect(transactionsService.getTransactions).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.GET_TRANSACTIONS_SUCCESS, code: HttpStatus.OK });
  });

  it('getAggregatedTransactions delegates to service.getAggregatedTransactions', async () => {
    transactionsService.getAggregatedTransactions.mockResolvedValue({ total: 0 });
    const dto = { groupBy: 'month' } as any;

    const result = await controller.getAggregatedTransactions(dto, 'user-1');

    expect(transactionsService.getAggregatedTransactions).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.GET_AGGREGATED_TRANSACTIONS_SUCCESS });
  });

  it('getTransaction delegates to service.getTransactionById with id and userId', async () => {
    transactionsService.getTransactionById.mockResolvedValue({ id: 'tx-1' });

    const result = await controller.getTransaction('tx-1', 'user-1');

    expect(transactionsService.getTransactionById).toHaveBeenCalledWith('user-1', 'tx-1');
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.GET_TRANSACTION_DETAIL_SUCCESS });
  });

  it('createTransaction delegates to service.createTransaction and returns 201', async () => {
    const dto = { amount: 50000, type: 'EXPENSE' } as any;
    transactionsService.createTransaction.mockResolvedValue({ id: 'tx-new' });

    const result = await controller.createTransaction(dto, 'user-1');

    expect(transactionsService.createTransaction).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.CREATE_TRANSACTION_SUCCESS, code: HttpStatus.CREATED });
  });

  it('distributeIncome delegates to service.distributeIncome and returns 201 with an array', async () => {
    const dto = { amount: 5000000 } as any;
    transactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);

    const result = await controller.distributeIncome(dto, 'user-1');

    expect(transactionsService.distributeIncome).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({
      message: TRANSACTIONS_CONST.INCOME_DISTRIBUTED_SUCCESS,
      code: HttpStatus.CREATED,
      data: [{ id: 'tx-1' }, { id: 'tx-2' }],
    });
  });

  it('updateTransaction delegates to service.updateTransaction with id, body and userId', async () => {
    const dto = { amount: 60000 } as any;
    transactionsService.updateTransaction.mockResolvedValue({ id: 'tx-1', amount: 60000 });

    const result = await controller.updateTransaction('tx-1', dto, 'user-1');

    expect(transactionsService.updateTransaction).toHaveBeenCalledWith('user-1', 'tx-1', dto);
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.UPDATE_TRANSACTION_SUCCESS });
  });

  it('deleteTransaction delegates to service.deleteTransaction with id and userId', async () => {
    transactionsService.deleteTransaction.mockResolvedValue(undefined);

    const result = await controller.deleteTransaction('tx-1', 'user-1');

    expect(transactionsService.deleteTransaction).toHaveBeenCalledWith('user-1', 'tx-1');
    expect(result).toMatchObject({ message: TRANSACTIONS_CONST.DELETE_TRANSACTION_SUCCESS });
  });
});
