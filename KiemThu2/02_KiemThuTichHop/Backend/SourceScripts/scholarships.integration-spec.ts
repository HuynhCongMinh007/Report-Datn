import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { StudentScholarshipsController } from '@/modules/scholarships/controllers/student-scholarships.controller';
import { ScholarshipsController } from '@/modules/scholarships/controllers/scholarships.controller';
import { StudentScholarshipsService } from '@/modules/scholarships/services/student-scholarships.service';
import { ScholarshipsService } from '@/modules/scholarships/services/scholarships.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';
import { SCHOLARSHIPS_CONSTANT } from '@/modules/scholarships/constants/scholarships.constant';

const { NotFoundException, BadRequestException, ConflictException } = require('@nestjs/common');

/**
 * Integration test for the scholarship application lifecycle across the full
 * HTTP stack (real controllers + StackAuthGuard override + ValidationPipe +
 * filters + TransformInterceptor). Services are mocked — this covers the
 * draft -> update -> submit -> status/cancel lifecycle that the live e2e
 * suite (business-flows.e2e-spec.ts) intentionally avoids exercising against
 * the real account, because a real create-then-delete run of this lifecycle
 * left orphaned rows (see the NOTE below and in that file). No live DB
 * required, so this suite is free to probe every branch without leaving
 * state behind.
 */
describe('Scholarship application lifecycle API', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const studentScholarshipsService = {
    findAll: jest.fn(),
    findByOrganization: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    submit: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
    registerScholarship: jest.fn(),
    unregisterScholarship: jest.fn(),
    getUserScholarships: jest.fn(),
    getUserScholarshipDetail: jest.fn(),
    confirmScholarship: jest.fn(),
  };
  const scholarshipsService = {
    findOne: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentScholarshipsController, ScholarshipsController],
      providers: [
        { provide: StudentScholarshipsService, useValue: studentScholarshipsService },
        { provide: ScholarshipsService, useValue: scholarshipsService },
      ],
    })
      // ScholarshipsController applies StackAuthGuard per-route (register,
      // my-scholarships/:id) — override that instance so it doesn't try to
      // build the real guard (ConfigService/AuthService/Cache deps).
      .overrideGuard(StackAuthGuard)
      .useValue(passUser)
      .compile();

    app = moduleRef.createNestApplication();
    // StudentScholarshipsController has `@UseGuards(StackAuthGuard)`
    // commented out at the class level — in the real app, auth still applies
    // because StackAuthGuard is also registered globally via APP_GUARD in
    // app.module.ts. A bare TestingModule here doesn't pull in AppModule's
    // global providers, so we register the (stubbed) auth guard globally
    // ourselves too, to match production behaviour for that controller.
    app.useGlobalGuards(passUser);
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

  // ── POST /student-scholarships (create draft) ───────────────────────
  describe('POST /student-scholarships', () => {
    it('returns 201 and creates a draft application', async () => {
      studentScholarshipsService.create.mockResolvedValue({ id: 'app-1', status: 'draft' });

      const res = await request(app.getHttpServer())
        .post('/student-scholarships')
        .send({ scholarshipId: '550e8400-e29b-41d4-a716-446655440000', note: 'first try' })
        .expect(201);

      expect(res.body.data.id).toBe('app-1');
      expect(studentScholarshipsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ scholarshipId: '550e8400-e29b-41d4-a716-446655440000' }),
        'user-1',
      );
    });

    it('returns 400 when scholarshipId is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/student-scholarships')
        .send({ scholarshipId: 'not-a-uuid' })
        .expect(400);
      expect(studentScholarshipsService.create).not.toHaveBeenCalled();
    });
  });

  // ── PUT /student-scholarships/:id (update draft) ────────────────────
  describe('PUT /student-scholarships/:id', () => {
    it('returns 200 and updates the draft', async () => {
      studentScholarshipsService.update.mockResolvedValue({ id: 'app-1', note: 'updated note' });

      const res = await request(app.getHttpServer())
        .put('/student-scholarships/app-1')
        .send({ note: 'updated note' })
        .expect(200);

      expect(res.body.data.note).toBe('updated note');
      expect(studentScholarshipsService.update).toHaveBeenCalledWith('app-1', expect.objectContaining({ note: 'updated note' }), 'user-1');
    });

    it('propagates 400 when the application is no longer a draft', async () => {
      studentScholarshipsService.update.mockRejectedValue(new BadRequestException(SCHOLARSHIPS_CONSTANT.CANNOT_UPDATE_NON_DRAFT_STATUS));

      const res = await request(app.getHttpServer()).put('/student-scholarships/app-1').send({ note: 'x' }).expect(400);
      expect(res.body.message).toContain(SCHOLARSHIPS_CONSTANT.CANNOT_UPDATE_NON_DRAFT_STATUS);
    });

    it('propagates 404 when the application does not belong to this user', async () => {
      studentScholarshipsService.update.mockRejectedValue(new NotFoundException(SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND_OR_UNAUTHORIZED));

      await request(app.getHttpServer()).put('/student-scholarships/not-mine').send({ note: 'x' }).expect(404);
    });
  });

  // ── POST /student-scholarships/:id/submit ───────────────────────────
  describe('POST /student-scholarships/:id/submit', () => {
    it('returns 200 and moves the application to submitted', async () => {
      studentScholarshipsService.submit.mockResolvedValue({ id: 'app-1', status: 'submitted' });

      const res = await request(app.getHttpServer())
        .post('/student-scholarships/app-1/submit')
        .send({ note: 'ready to submit' })
        .expect(201);

      expect(res.body.data.status).toBe('submitted');
    });

    it('returns 400 when submittedFormUrl is not a valid URL', async () => {
      await request(app.getHttpServer())
        .post('/student-scholarships/app-1/submit')
        .send({ submittedFormUrl: 'not-a-url' })
        .expect(400);
      expect(studentScholarshipsService.submit).not.toHaveBeenCalled();
    });

    it('propagates 400 when the application is already submitted', async () => {
      studentScholarshipsService.submit.mockRejectedValue(new BadRequestException(SCHOLARSHIPS_CONSTANT.CAN_ONLY_SUBMIT_DRAFT_STATUS));

      const res = await request(app.getHttpServer()).post('/student-scholarships/app-1/submit').send({}).expect(400);
      expect(res.body.message).toContain(SCHOLARSHIPS_CONSTANT.CAN_ONLY_SUBMIT_DRAFT_STATUS);
    });
  });

  // ── PUT /student-scholarships/:id/status (reviewer decision) ────────
  describe('PUT /student-scholarships/:id/status', () => {
    it('returns 200 and applies an approved decision', async () => {
      studentScholarshipsService.updateStatus.mockResolvedValue({ id: 'app-1', status: 'approved' });

      const res = await request(app.getHttpServer())
        .put('/student-scholarships/app-1/status')
        .send({ status: 'approved', awardedAmount: 5000000, currency: 'VND' })
        .expect(200);

      expect(res.body.data.status).toBe('approved');
    });

    it('returns 400 when status is not one of the known enum values', async () => {
      await request(app.getHttpServer())
        .put('/student-scholarships/app-1/status')
        .send({ status: 'not-a-real-status' })
        .expect(400);
      expect(studentScholarshipsService.updateStatus).not.toHaveBeenCalled();
    });

    it('propagates 404 when the application does not exist', async () => {
      studentScholarshipsService.updateStatus.mockRejectedValue(new NotFoundException(SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND));

      await request(app.getHttpServer()).put('/student-scholarships/missing/status').send({ status: 'rejected' }).expect(404);
    });
  });

  // ── DELETE /student-scholarships/:id ─────────────────────────────────
  // NOTE: pins down a known defect (also flagged in business-flows.e2e-spec.ts's
  // Scholarships describe block): the controller reads `user.id`, but
  // AuthUser only exposes `userId` — so the service always receives
  // `userId: undefined` here, not the caller's real id. This test documents
  // the current (broken) contract rather than the intended one, so a future
  // fix of the controller will make it fail and must be updated deliberately.
  describe('DELETE /student-scholarships/:id (known defect)', () => {
    it('forwards undefined as the userId instead of the authenticated user id', async () => {
      studentScholarshipsService.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete('/student-scholarships/app-1').expect(204);

      expect(studentScholarshipsService.remove).toHaveBeenCalledWith('app-1', undefined);
    });

    it('propagates 400 when the application is not a draft', async () => {
      studentScholarshipsService.remove.mockRejectedValue(new BadRequestException(SCHOLARSHIPS_CONSTANT.CAN_ONLY_DELETE_DRAFT_STATUS));

      await request(app.getHttpServer()).delete('/student-scholarships/app-1').expect(400);
    });
  });

  // ── GET /student-scholarships, /my-applications, /:id ────────────────
  describe('Read endpoints', () => {
    it('GET /student-scholarships (public) returns 200 without Authorization', async () => {
      studentScholarshipsService.findAll.mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });
      await request(app.getHttpServer()).get('/student-scholarships').expect(200);
    });

    it('GET /student-scholarships/my-applications scopes to the authenticated user', async () => {
      studentScholarshipsService.findAll.mockResolvedValue({ items: [{ id: 'app-1' }], meta: { page: 1, limit: 20, total: 1 } });

      await request(app.getHttpServer()).get('/student-scholarships/my-applications').expect(200);
      expect(studentScholarshipsService.findAll).toHaveBeenCalledWith('user-1', undefined, 1, 20);
    });

    it('GET /student-scholarships/:id returns 404 when the service throws', async () => {
      studentScholarshipsService.findOne.mockRejectedValue(new NotFoundException(SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND));
      await request(app.getHttpServer()).get('/student-scholarships/missing').expect(404);
    });
  });

  // ── POST /scholarships/register ──────────────────────────────────────
  describe('POST /scholarships/register', () => {
    it('returns 201 and creates a draft registration', async () => {
      studentScholarshipsService.registerScholarship.mockResolvedValue({ id: 'app-2', status: 'draft' });

      await request(app.getHttpServer())
        .post('/scholarships/register')
        .send({ scholarship_id: '550e8400-e29b-41d4-a716-446655440000', isDraft: true, gpa: 3.6 })
        .expect(201);

      expect(studentScholarshipsService.registerScholarship).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ scholarship_id: '550e8400-e29b-41d4-a716-446655440000', isDraft: true }),
      );
    });

    it('returns 400 when scholarship_id is missing', async () => {
      await request(app.getHttpServer()).post('/scholarships/register').send({ isDraft: true }).expect(400);
      expect(studentScholarshipsService.registerScholarship).not.toHaveBeenCalled();
    });

    it('returns 400 when nationalId is not exactly 12 digits', async () => {
      await request(app.getHttpServer())
        .post('/scholarships/register')
        .send({ scholarship_id: '550e8400-e29b-41d4-a716-446655440000', nationalId: '123' })
        .expect(400);
      expect(studentScholarshipsService.registerScholarship).not.toHaveBeenCalled();
    });

    it('propagates 404 when the scholarship does not exist', async () => {
      studentScholarshipsService.registerScholarship.mockRejectedValue(new NotFoundException(SCHOLARSHIPS_CONSTANT.SCHOLARSHIP_NOT_FOUND));

      await request(app.getHttpServer())
        .post('/scholarships/register')
        .send({ scholarship_id: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
    });

    it('propagates 400 when the application deadline has passed', async () => {
      studentScholarshipsService.registerScholarship.mockRejectedValue(new BadRequestException(SCHOLARSHIPS_CONSTANT.DEADLINE_PASSED));

      const res = await request(app.getHttpServer())
        .post('/scholarships/register')
        .send({ scholarship_id: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(400);
      expect(res.body.message).toContain(SCHOLARSHIPS_CONSTANT.DEADLINE_PASSED);
    });
  });

  // ── DELETE /scholarships/my-scholarships/:id (correctly-scoped cancel) ─
  describe('DELETE /scholarships/my-scholarships/:id', () => {
    it('returns 204 and cancels a draft/submitted application, scoped to the user', async () => {
      studentScholarshipsService.unregisterScholarship.mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete('/scholarships/my-scholarships/app-2').expect(204);
      expect(studentScholarshipsService.unregisterScholarship).toHaveBeenCalledWith('user-1', 'app-2');
    });

    it('propagates 404 when the application does not belong to this user', async () => {
      studentScholarshipsService.unregisterScholarship.mockRejectedValue(new NotFoundException(SCHOLARSHIPS_CONSTANT.APPLICATION_NOT_FOUND));

      await request(app.getHttpServer()).delete('/scholarships/my-scholarships/not-mine').expect(404);
    });

    it('propagates 409 when the application is already approved/rejected (not cancellable)', async () => {
      studentScholarshipsService.unregisterScholarship.mockRejectedValue(new ConflictException(SCHOLARSHIPS_CONSTANT.CANNOT_CANCEL_APPLICATION));

      const res = await request(app.getHttpServer()).delete('/scholarships/my-scholarships/app-2').expect(409);
      expect(res.body.message).toContain(SCHOLARSHIPS_CONSTANT.CANNOT_CANCEL_APPLICATION);
    });
  });
});
