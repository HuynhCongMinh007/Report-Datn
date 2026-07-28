import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { FinancialTransactionsController } from '@/modules/financial-transactions/financial-transactions.controller';
import { FinancialTransactionsService } from '@/modules/financial-transactions/financial-transactions.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';
import { TRANSACTIONS_CONST } from '@/modules/financial-transactions/constants/transactions.constant';

const { NotFoundException, BadRequestException, ForbiddenException } = require('@nestjs/common');

/**
 * Integration test for the Financial Transactions API (/finance/transactions)
 * across the full HTTP stack (real controller + StackAuthGuard override +
 * ValidationPipe + filters + TransformInterceptor). FinancialTransactionsService
 * is mocked. See jars.integration-spec.ts for why this file exists (parity
 * with the modules that previously only had live e2e coverage). No live DB
 * required.
 */
describe('Financial Transactions API (/finance/transactions)', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const transactionsService = {
    getTransactions: jest.fn(),
    getAggregatedTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    createTransaction: jest.fn(),
    distributeIncome: jest.fn(),
    updateTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinancialTransactionsController],
      providers: [{ provide: FinancialTransactionsService, useValue: transactionsService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue(passUser)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: validationExceptionFactory,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const validCreateDto = {
    type: 'expense',
    amount: 150000,
    moneyJarId: '11111111-1111-4111-8111-111111111111',
    transactionDate: '2026-05-05T10:00:00Z',
  };

  describe('GET /finance/transactions', () => {
    it('returns 200 scoped to the authenticated user', async () => {
      transactionsService.getTransactions.mockResolvedValue({ items: [], meta: { total: 0 } });
      await request(app.getHttpServer()).get('/finance/transactions').expect(200);
      expect(transactionsService.getTransactions).toHaveBeenCalledWith('user-1', expect.anything());
    });

    it('returns 400 when limit exceeds the maximum', async () => {
      await request(app.getHttpServer()).get('/finance/transactions?limit=5000').expect(400);
      expect(transactionsService.getTransactions).not.toHaveBeenCalled();
    });

    it('returns 400 when type is not a valid FinancialRecordType', async () => {
      await request(app.getHttpServer()).get('/finance/transactions?type=not-a-type').expect(400);
      expect(transactionsService.getTransactions).not.toHaveBeenCalled();
    });
  });

  describe('GET /finance/transactions/aggregate', () => {
    it('returns 200 with a valid period', async () => {
      transactionsService.getAggregatedTransactions.mockResolvedValue({ buckets: [] });
      await request(app.getHttpServer()).get('/finance/transactions/aggregate?period=month').expect(200);
    });

    it('returns 400 when period is invalid', async () => {
      await request(app.getHttpServer()).get('/finance/transactions/aggregate?period=year').expect(400);
      expect(transactionsService.getAggregatedTransactions).not.toHaveBeenCalled();
    });
  });

  describe('GET /finance/transactions/:id', () => {
    it('propagates 404 when the transaction does not belong to this user', async () => {
      transactionsService.getTransactionById.mockRejectedValue(new NotFoundException(TRANSACTIONS_CONST.TRANSACTION_NOT_FOUND));
      await request(app.getHttpServer()).get('/finance/transactions/not-mine').expect(404);
    });
  });

  describe('POST /finance/transactions', () => {
    it('returns 201 with a valid expense payload', async () => {
      transactionsService.createTransaction.mockResolvedValue({ id: 'tx-1', amount: 150000 });
      const res = await request(app.getHttpServer()).post('/finance/transactions').send(validCreateDto).expect(201);
      expect(res.body.data.id).toBe('tx-1');
    });

    it('returns 400 when amount is 0', async () => {
      await request(app.getHttpServer()).post('/finance/transactions').send({ ...validCreateDto, amount: 0 }).expect(400);
      expect(transactionsService.createTransaction).not.toHaveBeenCalled();
    });

    it('returns 400 when moneyJarId is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/finance/transactions')
        .send({ ...validCreateDto, moneyJarId: 'not-a-uuid' })
        .expect(400);
      expect(transactionsService.createTransaction).not.toHaveBeenCalled();
    });

    it('returns 400 when type is missing', async () => {
      const { type, ...rest } = validCreateDto;
      await request(app.getHttpServer()).post('/finance/transactions').send(rest).expect(400);
      expect(transactionsService.createTransaction).not.toHaveBeenCalled();
    });

    it('propagates 400 when the transaction date is in the future', async () => {
      transactionsService.createTransaction.mockRejectedValue(new BadRequestException(TRANSACTIONS_CONST.INVALID_DATE));
      await request(app.getHttpServer()).post('/finance/transactions').send(validCreateDto).expect(400);
    });

    it('propagates 404 when the jar does not exist', async () => {
      transactionsService.createTransaction.mockRejectedValue(new NotFoundException(TRANSACTIONS_CONST.JAR_NOT_FOUND));
      await request(app.getHttpServer()).post('/finance/transactions').send(validCreateDto).expect(404);
    });
  });

  describe('POST /finance/transactions/distribute-income', () => {
    it('returns 201 and splits income across jars', async () => {
      transactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);
      const res = await request(app.getHttpServer())
        .post('/finance/transactions/distribute-income')
        .send({ amount: 10000000, transactionDate: '2026-05-05T10:00:00Z' })
        .expect(201);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 400 when amount is missing', async () => {
      await request(app.getHttpServer())
        .post('/finance/transactions/distribute-income')
        .send({ transactionDate: '2026-05-05T10:00:00Z' })
        .expect(400);
      expect(transactionsService.distributeIncome).not.toHaveBeenCalled();
    });

    it('propagates 400 when there are no active jars for default allocation', async () => {
      transactionsService.distributeIncome.mockRejectedValue(new BadRequestException('No active jars found for default allocation'));
      await request(app.getHttpServer())
        .post('/finance/transactions/distribute-income')
        .send({ amount: 10000000, transactionDate: '2026-05-05T10:00:00Z' })
        .expect(400);
    });
  });

  describe('PATCH /finance/transactions/:id', () => {
    it('returns 200 on a valid update', async () => {
      transactionsService.updateTransaction.mockResolvedValue({ id: 'tx-1', amount: 200000 });
      await request(app.getHttpServer()).patch('/finance/transactions/tx-1').send({ amount: 200000 }).expect(200);
    });

    it('returns 400 when amount is negative', async () => {
      await request(app.getHttpServer()).patch('/finance/transactions/tx-1').send({ amount: -5 }).expect(400);
      expect(transactionsService.updateTransaction).not.toHaveBeenCalled();
    });

    it('propagates 403 when trying to edit a transfer transaction', async () => {
      transactionsService.updateTransaction.mockRejectedValue(new ForbiddenException(TRANSACTIONS_CONST.CANNOT_EDIT_TRANSFER));
      await request(app.getHttpServer()).patch('/finance/transactions/tx-1').send({ amount: 1 }).expect(403);
    });
  });

  describe('DELETE /finance/transactions/:id', () => {
    it('returns 200 on success', async () => {
      transactionsService.deleteTransaction.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete('/finance/transactions/tx-1').expect(200);
    });

    it('propagates 404 when the transaction does not exist', async () => {
      transactionsService.deleteTransaction.mockRejectedValue(new NotFoundException(TRANSACTIONS_CONST.TRANSACTION_NOT_FOUND));
      await request(app.getHttpServer()).delete('/finance/transactions/missing').expect(404);
    });
  });

  it('rejects with 401 when unauthenticated', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FinancialTransactionsController],
      providers: [{ provide: FinancialTransactionsService, useValue: transactionsService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue({ canActivate: () => { throw new (require('@nestjs/common').UnauthorizedException)(); } })
      .compile();
    const unauthedApp = moduleRef.createNestApplication();
    unauthedApp.useGlobalFilters(new HttpExceptionFilter());
    unauthedApp.useGlobalInterceptors(new TransformInterceptor());
    await unauthedApp.init();
    await request(unauthedApp.getHttpServer()).get('/finance/transactions').expect(401);
    await unauthedApp.close();
  });
});
