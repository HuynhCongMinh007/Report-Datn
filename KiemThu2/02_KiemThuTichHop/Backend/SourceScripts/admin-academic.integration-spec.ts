import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminAcademicController } from '@/modules/academic/controllers/admin-academic.controller';
import { AdminAcademicService } from '@/modules/academic/services/admin-academic.service';
import { AdminAuthGuard } from '@/common/guards/admin-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';

const { NotFoundException, BadRequestException } = require('@nestjs/common');

/**
 * Integration test for the admin academic-data API (universities, subjects,
 * training programs) across the full HTTP stack (real controller +
 * AdminAuthGuard/RolesGuard override + ValidationPipe + filters +
 * TransformInterceptor). AdminAcademicService is mocked — this covers DTO
 * validation, RBAC enforcement (ADMIN-only), and the not-found/conflict
 * branches (e.g. deleting a subject that still has student grades) that had
 * no coverage above the service unit tests. No live DB required.
 */
describe('Admin academic-data API (/admin/universities, /admin/subjects, /admin/training-programs)', () => {
  let app: INestApplication;
  const ADMIN_USER = { accountId: 'admin-acc-1', userId: 'admin-user-1', role: 'ADMIN' };

  const academicService = {
    getUniversities: jest.fn(),
    createUniversity: jest.fn(),
    updateUniversity: jest.fn(),
    deleteUniversity: jest.fn(),
    getUniversitySubjects: jest.fn(),
    createUniversitySubject: jest.fn(),
    updateSubject: jest.fn(),
    deleteSubject: jest.fn(),
    getUniversityTrainingPrograms: jest.fn(),
    createUniversityTrainingProgram: jest.fn(),
    updateTrainingProgram: jest.fn(),
    deleteTrainingProgram: jest.fn(),
  };

  const passAdmin = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = ADMIN_USER;
      return true;
    },
  };

  async function buildApp(guardOverrides: { admin?: any; roles?: any } = {}) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAcademicController],
      providers: [{ provide: AdminAcademicService, useValue: academicService }],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue(guardOverrides.admin ?? passAdmin)
      .overrideGuard(RolesGuard)
      .useValue(guardOverrides.roles ?? { canActivate: () => true })
      .compile();

    const testApp = moduleRef.createNestApplication();
    testApp.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: validationExceptionFactory,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    testApp.useGlobalFilters(new HttpExceptionFilter());
    testApp.useGlobalInterceptors(new TransformInterceptor());
    await testApp.init();
    return testApp;
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  // ── RBAC ──────────────────────────────────────────────────────────────
  describe('RBAC', () => {
    it('rejects with 401 when unauthenticated', async () => {
      const unauthedApp = await buildApp({
        admin: { canActivate: () => { throw new (require('@nestjs/common').UnauthorizedException)(); } },
      });
      await request(unauthedApp.getHttpServer()).get('/admin/universities').expect(401);
      await unauthedApp.close();
    });

    it('rejects with 403 when authenticated but not ADMIN', async () => {
      const forbiddenApp = await buildApp({
        roles: { canActivate: () => { throw new (require('@nestjs/common').ForbiddenException)(); } },
      });
      await request(forbiddenApp.getHttpServer()).get('/admin/universities').expect(403);
      await forbiddenApp.close();
    });
  });

  // ── Universities ─────────────────────────────────────────────────────
  describe('Universities', () => {
    it('GET /admin/universities returns 200 with the list', async () => {
      academicService.getUniversities.mockResolvedValue({ data: [{ id: 'u1', name: 'HCMUS' }], meta: { total: 1 } });
      const res = await request(app.getHttpServer()).get('/admin/universities').expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /admin/universities returns 201 with a valid payload', async () => {
      academicService.createUniversity.mockResolvedValue({ id: 'u1', name: 'HCMUS' });
      await request(app.getHttpServer())
        .post('/admin/universities')
        .send({ name: 'HCMUS', code: 'HCMUS', city: 'HCMC' })
        .expect(201);
      expect(academicService.createUniversity).toHaveBeenCalledWith(expect.objectContaining({ name: 'HCMUS' }));
    });

    it('POST /admin/universities returns 400 when name is missing', async () => {
      await request(app.getHttpServer()).post('/admin/universities').send({ code: 'HCMUS' }).expect(400);
      expect(academicService.createUniversity).not.toHaveBeenCalled();
    });

    it('POST /admin/universities returns 400 when status is not a valid enum value', async () => {
      await request(app.getHttpServer())
        .post('/admin/universities')
        .send({ name: 'HCMUS', status: 'not-a-real-status' })
        .expect(400);
      expect(academicService.createUniversity).not.toHaveBeenCalled();
    });

    it('PUT /admin/universities/:id returns 404 when the university does not exist', async () => {
      academicService.updateUniversity.mockRejectedValue(new NotFoundException('University not found'));
      await request(app.getHttpServer()).put('/admin/universities/missing').send({ name: 'X' }).expect(404);
    });

    it('DELETE /admin/universities/:id returns 200 on success', async () => {
      academicService.deleteUniversity.mockResolvedValue({ success: true });
      await request(app.getHttpServer()).delete('/admin/universities/u1').expect(200);
    });

    it('DELETE /admin/universities/:id returns 400 when the university still has dependent data', async () => {
      academicService.deleteUniversity.mockRejectedValue(new BadRequestException('Cannot delete university with existing dependent records.'));
      await request(app.getHttpServer()).delete('/admin/universities/u1').expect(400);
    });
  });

  // ── Subjects ─────────────────────────────────────────────────────────
  describe('Subjects', () => {
    it('POST /admin/universities/:id/subjects returns 201 with a valid payload', async () => {
      academicService.createUniversitySubject.mockResolvedValue({ id: 's1', subject_code: 'CSC10001' });
      await request(app.getHttpServer())
        .post('/admin/universities/u1/subjects')
        .send({ subject_code: 'CSC10001', subject_name: 'Introduction to Programming', credits: 4 })
        .expect(201);
    });

    it('POST /admin/universities/:id/subjects returns 400 when credits is missing', async () => {
      await request(app.getHttpServer())
        .post('/admin/universities/u1/subjects')
        .send({ subject_code: 'CSC10001', subject_name: 'Intro to Programming' })
        .expect(400);
      expect(academicService.createUniversitySubject).not.toHaveBeenCalled();
    });

    it('POST /admin/universities/:id/subjects returns 400 when credits is negative', async () => {
      await request(app.getHttpServer())
        .post('/admin/universities/u1/subjects')
        .send({ subject_code: 'CSC10001', subject_name: 'Intro', credits: -1 })
        .expect(400);
      expect(academicService.createUniversitySubject).not.toHaveBeenCalled();
    });

    it('POST /admin/universities/:id/subjects returns 404 when the university does not exist', async () => {
      academicService.createUniversitySubject.mockRejectedValue(new NotFoundException('University not found'));
      await request(app.getHttpServer())
        .post('/admin/universities/missing/subjects')
        .send({ subject_code: 'CSC10001', subject_name: 'Intro', credits: 4 })
        .expect(404);
    });

    it('DELETE /admin/subjects/:id returns 400 when student grades already reference the subject', async () => {
      academicService.deleteSubject.mockRejectedValue(
        new BadRequestException('Cannot delete subject because there are existing student grades associated with it.'),
      );
      const res = await request(app.getHttpServer()).delete('/admin/subjects/s1').expect(400);
      expect(res.body.message).toContain('existing student grades');
    });

    it('DELETE /admin/subjects/:id returns 404 when the subject does not exist', async () => {
      academicService.deleteSubject.mockRejectedValue(new NotFoundException('Subject not found'));
      await request(app.getHttpServer()).delete('/admin/subjects/missing').expect(404);
    });
  });

  // ── Training programs ────────────────────────────────────────────────
  describe('Training programs', () => {
    it('POST /admin/universities/:id/training-programs returns 201 with a valid payload', async () => {
      academicService.createUniversityTrainingProgram.mockResolvedValue({ id: 'p1', program_name: 'Computer Science' });
      await request(app.getHttpServer())
        .post('/admin/universities/u1/training-programs')
        .send({ program_name: 'Computer Science' })
        .expect(201);
    });

    it('POST /admin/universities/:id/training-programs returns 400 when program_name is missing', async () => {
      await request(app.getHttpServer())
        .post('/admin/universities/u1/training-programs')
        .send({ program_code: 'CS101' })
        .expect(400);
      expect(academicService.createUniversityTrainingProgram).not.toHaveBeenCalled();
    });

    it('DELETE /admin/training-programs/:id returns 400 when the program still has references', async () => {
      academicService.deleteTrainingProgram.mockRejectedValue(new BadRequestException('Cannot delete training program due to existing references.'));
      await request(app.getHttpServer()).delete('/admin/training-programs/p1').expect(400);
    });

    it('PUT /admin/training-programs/:id returns 404 when the program does not exist', async () => {
      academicService.updateTrainingProgram.mockRejectedValue(new NotFoundException('Training program not found'));
      await request(app.getHttpServer()).put('/admin/training-programs/missing').send({ program_name: 'X' }).expect(404);
    });
  });
});
