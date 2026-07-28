import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { LoansController } from '@/modules/loans/loans.controller';
import { LoansService } from '@/modules/loans/loans.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';
import { LOANS_CONST } from '@/modules/loans/constants/loans.constant';

/**
 * Integration test for the Loans API across the full HTTP stack (real
 * controller + StackAuthGuard override + ValidationPipe + filters +
 * TransformInterceptor). LoansService is mocked — this is the layer that had
 * zero test coverage above the service (see backend/loans.service.spec.ts for
 * the unit layer). No live DB required.
 */
describe('Loans API (/loans)', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const loansService = {
    getLoans: jest.fn(),
    getLoanDetail: jest.fn(),
    registerLoan: jest.fn(),
    getUserLoans: jest.fn(),
    getUserLoansDetail: jest.fn(),
    unregisterLoan: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LoansController],
      providers: [{ provide: LoansService, useValue: loansService }],
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

  // ── GET /loans (public catalogue) ─────────────────────────────────────
  describe('GET /loans', () => {
    it('returns 200 with the paginated loan package list', async () => {
      loansService.getLoans.mockResolvedValue({
        data: [{ id: 'pkg-1', name: 'Student loan' }],
        meta: { page: 1, limit: 20, total: 1 },
      });

      const res = await request(app.getHttpServer()).get('/loans').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(loansService.getLoans).toHaveBeenCalledTimes(1);
    });

    it('does not require Authorization (public endpoint)', async () => {
      loansService.getLoans.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });

      await request(app.getHttpServer()).get('/loans').expect(200);
    });
  });

  // ── GET /loans/:id ───────────────────────────────────────────────────
  describe('GET /loans/:id', () => {
    it('returns 200 with the loan package detail', async () => {
      loansService.getLoanDetail.mockResolvedValue({ id: 'pkg-1', name: 'Student loan' });

      const res = await request(app.getHttpServer()).get('/loans/pkg-1').expect(200);

      expect(res.body.data.id).toBe('pkg-1');
      expect(loansService.getLoanDetail).toHaveBeenCalledWith('pkg-1');
    });

    it('propagates 404 when the service throws NotFoundException', async () => {
      loansService.getLoanDetail.mockRejectedValue(new (require('@nestjs/common').NotFoundException)(LOANS_CONST.LOAN_PACKAGE_NOT_FOUND));

      const res = await request(app.getHttpServer()).get('/loans/does-not-exist').expect(404);
      expect(res.body.message).toContain(LOANS_CONST.LOAN_PACKAGE_NOT_FOUND);
    });
  });

  // ── POST /loans/register ────────────────────────────────────────────
  describe('POST /loans/register', () => {
    const validDto = { loan_package_id: 'pkg-1', principal_amount: 10000000, term_months: 12 };

    it('returns 201 and creates a loan application with the authenticated user id', async () => {
      loansService.registerLoan.mockResolvedValue({ id: 'loan-1', status: 'pending' });

      const res = await request(app.getHttpServer())
        .post('/loans/register')
        .send(validDto)
        .expect(201);

      expect(res.body.data.id).toBe('loan-1');
      expect(loansService.registerLoan).toHaveBeenCalledWith('user-1', expect.objectContaining(validDto));
    });

    it('returns 400 when loan_package_id is missing', async () => {
      await request(app.getHttpServer())
        .post('/loans/register')
        .send({ principal_amount: 10000000 })
        .expect(400);
      expect(loansService.registerLoan).not.toHaveBeenCalled();
    });

    it('returns 400 when principal_amount is not positive', async () => {
      await request(app.getHttpServer())
        .post('/loans/register')
        .send({ ...validDto, principal_amount: -1 })
        .expect(400);
      expect(loansService.registerLoan).not.toHaveBeenCalled();
    });

    it('returns 400 when term_months is below 1', async () => {
      await request(app.getHttpServer())
        .post('/loans/register')
        .send({ ...validDto, term_months: 0 })
        .expect(400);
      expect(loansService.registerLoan).not.toHaveBeenCalled();
    });

    it('propagates 404 when the loan package does not exist', async () => {
      loansService.registerLoan.mockRejectedValue(new (require('@nestjs/common').NotFoundException)(LOANS_CONST.LOAN_PACKAGE_NOT_FOUND));

      await request(app.getHttpServer()).post('/loans/register').send(validDto).expect(404);
    });

    it('propagates 400 when principal_amount is outside the package range', async () => {
      loansService.registerLoan.mockRejectedValue(new (require('@nestjs/common').BadRequestException)(LOANS_CONST.PRINCIPAL_AMOUNT_TOO_HIGH));

      const res = await request(app.getHttpServer()).post('/loans/register').send(validDto).expect(400);
      expect(res.body.message).toContain(LOANS_CONST.PRINCIPAL_AMOUNT_TOO_HIGH);
    });
  });

  // ── GET /loans/user/my-loans ────────────────────────────────────────
  describe('GET /loans/user/my-loans', () => {
    it('returns 200 scoped to the authenticated user', async () => {
      loansService.getUserLoans.mockResolvedValue({
        data: [{ id: 'loan-1' }],
        meta: { page: 1, limit: 20, total: 1 },
      });

      await request(app.getHttpServer()).get('/loans/user/my-loans').expect(200);
      expect(loansService.getUserLoans).toHaveBeenCalledWith('user-1', expect.anything());
    });

    it('rejects an unauthenticated request with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [LoansController],
        providers: [{ provide: LoansService, useValue: loansService }],
      })
        .overrideGuard(StackAuthGuard)
        .useValue({ canActivate: () => { throw new (require('@nestjs/common').UnauthorizedException)(); } })
        .compile();
      const unauthedApp = moduleRef.createNestApplication();
      unauthedApp.useGlobalFilters(new HttpExceptionFilter());
      unauthedApp.useGlobalInterceptors(new TransformInterceptor());
      await unauthedApp.init();

      await request(unauthedApp.getHttpServer()).get('/loans/user/my-loans').expect(401);
      await unauthedApp.close();
    });
  });

  // ── GET /loans/user/my-loans/:id ────────────────────────────────────
  describe('GET /loans/user/my-loans/:id', () => {
    it('returns 200 with the loan detail for a valid UUID', async () => {
      loansService.getUserLoansDetail.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });

      await request(app.getHttpServer())
        .get('/loans/user/my-loans/11111111-1111-4111-8111-111111111111')
        .expect(200);
      expect(loansService.getUserLoansDetail).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
      );
    });

    it('returns 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/loans/user/my-loans/not-a-uuid').expect(400);
      expect(loansService.getUserLoansDetail).not.toHaveBeenCalled();
    });
  });

  // ── DELETE /loans/user/my-loans/:id ─────────────────────────────────
  describe('DELETE /loans/user/my-loans/:id', () => {
    it('returns 204 and cancels the loan', async () => {
      loansService.unregisterLoan.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/loans/user/my-loans/loan-1')
        .expect(204);
      expect(loansService.unregisterLoan).toHaveBeenCalledWith('user-1', 'loan-1');
    });

    it('propagates 404 when the user loan does not belong to this user', async () => {
      loansService.unregisterLoan.mockRejectedValue(new (require('@nestjs/common').NotFoundException)(LOANS_CONST.USER_LOAN_NOT_FOUND));

      await request(app.getHttpServer()).delete('/loans/user/my-loans/not-mine').expect(404);
    });

    it('propagates 409 when the loan is no longer cancellable', async () => {
      loansService.unregisterLoan.mockRejectedValue(new (require('@nestjs/common').ConflictException)(LOANS_CONST.CANNOT_CANCEL_LOAN));

      const res = await request(app.getHttpServer()).delete('/loans/user/my-loans/loan-1').expect(409);
      expect(res.body.message).toContain(LOANS_CONST.CANNOT_CANCEL_LOAN);
    });
  });
});
