import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JarsController } from '@/modules/jars/jars.controller';
import { JarsService } from '@/modules/jars/jars.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';
import { JARS_CONST } from '@/modules/jars/constants/jars.constant';

const { NotFoundException, BadRequestException, ForbiddenException, ConflictException } = require('@nestjs/common');

/**
 * Integration test for the 6-Jars API (/finance/jars) across the full HTTP
 * stack (real controller + StackAuthGuard override + ValidationPipe +
 * filters + TransformInterceptor). JarsService is mocked. Added to bring
 * `jars`/`financial-transactions`/`ai_core` up to the same integration-layer
 * coverage that loans/finance-alerts/scholarships/admin-academic already
 * have — these three previously only had live e2e coverage
 * (business-flows.e2e-spec.ts / ai-gateway.e2e-spec.ts), not this layer.
 * No live DB required.
 */
describe('Jars API (/finance/jars)', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const jarsService = {
    getJars: jest.fn(),
    getJarAllocations: jest.fn(),
    updateJarAllocations: jest.fn(),
    getJarTags: jest.fn(),
    createJarTag: jest.fn(),
    updateJarTag: jest.fn(),
    deleteJarTag: jest.fn(),
    getJarDetail: jest.fn(),
    createJar: jest.fn(),
    updateJar: jest.fn(),
    deleteUserJar: jest.fn(),
    updateJarPercentages: jest.fn(),
    getJarTransactions: jest.fn(),
    getJarStatistics: jest.fn(),
    getJarChartData: jest.fn(),
    getJarNotificationSetting: jest.fn(),
    updateJarNotificationSetting: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JarsController],
      providers: [{ provide: JarsService, useValue: jarsService }],
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

  describe('GET /finance/jars', () => {
    it('returns 200 with the 6 system jars scoped to the user', async () => {
      jarsService.getJars.mockResolvedValue([{ id: 'jar-1', code: 'essentials' }]);
      await request(app.getHttpServer()).get('/finance/jars').expect(200);
      expect(jarsService.getJars).toHaveBeenCalledWith('user-1', expect.anything());
    });

    it('rejects with 401 when unauthenticated', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [JarsController],
        providers: [{ provide: JarsService, useValue: jarsService }],
      })
        .overrideGuard(StackAuthGuard)
        .useValue({ canActivate: () => { throw new (require('@nestjs/common').UnauthorizedException)(); } })
        .compile();
      const unauthedApp = moduleRef.createNestApplication();
      unauthedApp.useGlobalFilters(new HttpExceptionFilter());
      unauthedApp.useGlobalInterceptors(new TransformInterceptor());
      await unauthedApp.init();
      await request(unauthedApp.getHttpServer()).get('/finance/jars').expect(401);
      await unauthedApp.close();
    });
  });

  describe('GET /finance/jars/:id', () => {
    it('returns 404 when the jar does not exist', async () => {
      jarsService.getJarDetail.mockRejectedValue(new NotFoundException(JARS_CONST.JAR_NOT_FOUND));
      await request(app.getHttpServer()).get('/finance/jars/missing').expect(404);
    });
  });

  describe('POST /finance/jars', () => {
    it('returns 201 with a valid payload', async () => {
      jarsService.createJar.mockResolvedValue({ id: 'jar-2', name: 'Vacation Fund' });
      await request(app.getHttpServer())
        .post('/finance/jars')
        .send({ name: 'Vacation Fund', color: '#3B82F6', categoryType: 'other' })
        .expect(201);
    });

    it('returns 400 when name is empty', async () => {
      await request(app.getHttpServer()).post('/finance/jars').send({ name: '' }).expect(400);
      expect(jarsService.createJar).not.toHaveBeenCalled();
    });

    it('returns 400 when categoryType is not one of the allowed values', async () => {
      await request(app.getHttpServer())
        .post('/finance/jars')
        .send({ name: 'X', categoryType: 'not-a-real-category' })
        .expect(400);
      expect(jarsService.createJar).not.toHaveBeenCalled();
    });

    it('returns 400 when color is not a valid HEX code', async () => {
      await request(app.getHttpServer())
        .post('/finance/jars')
        .send({ name: 'X', color: 'blue' })
        .expect(400);
      expect(jarsService.createJar).not.toHaveBeenCalled();
    });

    it('propagates 409 when a jar with the same name already exists', async () => {
      jarsService.createJar.mockRejectedValue(new ConflictException(JARS_CONST.JAR_ALREADY_EXISTS));
      await request(app.getHttpServer()).post('/finance/jars').send({ name: 'Dup' }).expect(409);
    });
  });

  describe('PATCH /finance/jars/:id', () => {
    it('returns 200 on a valid partial update', async () => {
      jarsService.updateJar.mockResolvedValue({ id: 'jar-1', percentage: 20 });
      await request(app.getHttpServer()).patch('/finance/jars/jar-1').send({ percentage: 20 }).expect(200);
    });

    it('returns 400 when percentage is out of range', async () => {
      await request(app.getHttpServer()).patch('/finance/jars/jar-1').send({ percentage: 150 }).expect(400);
      expect(jarsService.updateJar).not.toHaveBeenCalled();
    });

    it('propagates 403 when trying to rename a system jar', async () => {
      jarsService.updateJar.mockRejectedValue(new ForbiddenException(JARS_CONST.CANNOT_MODIFY_SYSTEM_JAR));
      await request(app.getHttpServer()).patch('/finance/jars/jar-1').send({ name: 'X' }).expect(403);
    });
  });

  describe('DELETE /finance/jars/:id', () => {
    it('returns 200 on success', async () => {
      jarsService.deleteUserJar.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete('/finance/jars/jar-1').expect(200);
    });

    it('returns 400 when transferToJarId is not a UUID', async () => {
      await request(app.getHttpServer()).delete('/finance/jars/jar-1?transferToJarId=not-a-uuid').expect(400);
      expect(jarsService.deleteUserJar).not.toHaveBeenCalled();
    });

    it('propagates 400 when the jar still has a balance and no transfer target given', async () => {
      jarsService.deleteUserJar.mockRejectedValue(new BadRequestException('Cannot delete jar with balance.'));
      await request(app.getHttpServer()).delete('/finance/jars/jar-1').expect(400);
    });
  });

  describe('PUT /finance/jars/percent', () => {
    it('returns 200 with a valid payload', async () => {
      jarsService.updateJarPercentages.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .put('/finance/jars/percent')
        .send({ jars: [{ categoryId: '11111111-1111-4111-8111-111111111111', percentage: 100 }] })
        .expect(200);
    });

    it('returns 400 when jars is missing', async () => {
      await request(app.getHttpServer()).put('/finance/jars/percent').send({}).expect(400);
      expect(jarsService.updateJarPercentages).not.toHaveBeenCalled();
    });

    it('propagates 400 when percentages do not sum to 100', async () => {
      jarsService.updateJarPercentages.mockRejectedValue(new BadRequestException(JARS_CONST.PERCENTAGE_SUM_INVALID));
      const res = await request(app.getHttpServer())
        .put('/finance/jars/percent')
        .send({ jars: [{ categoryId: '11111111-1111-4111-8111-111111111111', percentage: 50 }] })
        .expect(400);
      expect(res.body.message).toContain(JARS_CONST.PERCENTAGE_SUM_INVALID);
    });
  });

  describe('Jar tags', () => {
    it('POST :id/tags returns 201 with a valid payload', async () => {
      jarsService.createJarTag.mockResolvedValue({ id: 'tag-1', name: 'Ăn uống' });
      await request(app.getHttpServer()).post('/finance/jars/jar-1/tags').send({ name: 'Ăn uống' }).expect(201);
    });

    it('POST :id/tags returns 400 when name is missing', async () => {
      await request(app.getHttpServer()).post('/finance/jars/jar-1/tags').send({}).expect(400);
      expect(jarsService.createJarTag).not.toHaveBeenCalled();
    });

    it('POST :id/tags propagates 409 when the tag already exists', async () => {
      jarsService.createJarTag.mockRejectedValue(new ConflictException('Tag already exists in this jar'));
      await request(app.getHttpServer()).post('/finance/jars/jar-1/tags').send({ name: 'Dup' }).expect(409);
    });

    it('DELETE tags/:tagId propagates 400 when deleting the default tag', async () => {
      jarsService.deleteJarTag.mockRejectedValue(new BadRequestException('Default tag cannot be deleted'));
      await request(app.getHttpServer()).delete('/finance/jars/tags/tag-1').expect(400);
    });
  });

  describe('Notification settings', () => {
    it('PUT :id/notification-settings returns 200 with a valid payload', async () => {
      jarsService.updateJarNotificationSetting.mockResolvedValue({ moneyJarId: 'jar-1', percentEnabled: true, percentValue: 80 });
      await request(app.getHttpServer())
        .put('/finance/jars/jar-1/notification-settings')
        .send({ percentEnabled: true, percentValue: 80 })
        .expect(200);
    });

    it('PUT :id/notification-settings returns 400 when percentValue is out of range', async () => {
      await request(app.getHttpServer())
        .put('/finance/jars/jar-1/notification-settings')
        .send({ percentEnabled: true, percentValue: 150 })
        .expect(400);
      expect(jarsService.updateJarNotificationSetting).not.toHaveBeenCalled();
    });
  });
});
