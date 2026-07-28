import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AiController } from '@/modules/ai_core/ai.controller';
import { AiService } from '@/modules/ai_core/ai.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { AiServiceGuard } from '@/common/guards/ai-service.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { validationExceptionFactory } from '@/common/filters/validation-exception.filter';

const { NotFoundException, UnauthorizedException } = require('@nestjs/common');

/**
 * Integration test for a representative slice of the AI Gateway API (/ai) —
 * chat, chat sessions, action execution/confirmation, anomalies, and the
 * internal AI-service callback — across the full HTTP stack (real controller
 * + guard overrides + ValidationPipe + filters + TransformInterceptor).
 * AiService is mocked. See jars.integration-spec.ts for why this file
 * exists. Streaming (`POST /ai/chat/stream`, SSE) and the lower-traffic
 * career-roadmap / mock-interview / scholarship-recommendation endpoints are
 * intentionally out of scope here — they warrant their own dedicated
 * integration coverage given their complexity. No live DB required.
 */
describe('AI Gateway API (/ai) — chat, actions, anomalies, callback', () => {
  let app: INestApplication;
  const USER = { accountId: 'acc-1', userId: 'user-1', role: 'STUDENT' };

  const aiService = {
    chat: jest.fn(),
    listChatSessions: jest.fn(),
    getChatMessages: jest.fn(),
    executeAction: jest.fn(),
    confirmActions: jest.fn(),
    getAnomalyAlerts: jest.fn(),
    markAlertRead: jest.fn(),
    handleAiCallback: jest.fn(),
  };

  const passUser = {
    canActivate: (context: any) => {
      context.switchToHttp().getRequest().user = USER;
      return true;
    },
  };
  const passAiService = { canActivate: () => true };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue(passUser)
      .overrideGuard(AiServiceGuard)
      .useValue(passAiService)
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

  describe('POST /ai/chat', () => {
    it('returns 200 with a valid message', async () => {
      aiService.chat.mockResolvedValue({ reply: 'Xin chào', sessionId: 'sess-1' });
      const res = await request(app.getHttpServer())
        .post('/ai/chat')
        .send({ message: 'Tôi nên tiết kiệm bao nhiêu?', currentContext: '6jars' })
        .expect(200);
      // TransformInterceptor snake_cases response keys.
      expect(res.body.data.session_id).toBe('sess-1');
      expect(aiService.chat).toHaveBeenCalledWith('user-1', expect.objectContaining({ message: expect.any(String) }));
    });

    it('returns 400 when message is empty', async () => {
      await request(app.getHttpServer()).post('/ai/chat').send({ message: '' }).expect(400);
      expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('returns 400 when sessionId is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/ai/chat')
        .send({ message: 'hi', sessionId: 'not-a-uuid' })
        .expect(400);
      expect(aiService.chat).not.toHaveBeenCalled();
    });

    it('returns 400 when aiProvider is not a known enum value', async () => {
      await request(app.getHttpServer())
        .post('/ai/chat')
        .send({ message: 'hi', aiProvider: 'openai' })
        .expect(400);
      expect(aiService.chat).not.toHaveBeenCalled();
    });
  });

  describe('GET /ai/chat/sessions', () => {
    it('returns 200 scoped to the authenticated user', async () => {
      aiService.listChatSessions.mockResolvedValue([{ id: 'sess-1' }]);
      await request(app.getHttpServer()).get('/ai/chat/sessions').expect(200);
      expect(aiService.listChatSessions).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /ai/chat/sessions/:id/messages', () => {
    it('returns 400 when the session id is not a UUID', async () => {
      await request(app.getHttpServer()).get('/ai/chat/sessions/not-a-uuid/messages').expect(400);
      expect(aiService.getChatMessages).not.toHaveBeenCalled();
    });

    it('propagates 404 when the session does not belong to this user', async () => {
      aiService.getChatMessages.mockRejectedValue(new NotFoundException('Session not found'));
      await request(app.getHttpServer())
        .get('/ai/chat/sessions/11111111-1111-4111-8111-111111111111/messages')
        .expect(404);
    });
  });

  describe('POST /ai/actions/execute', () => {
    it('returns 200 executing a CREATE_TRANSACTION action', async () => {
      aiService.executeAction.mockResolvedValue({ success: true, message: 'Đã tạo giao dịch' });
      await request(app.getHttpServer())
        .post('/ai/actions/execute')
        .send({
          type: 'CREATE_TRANSACTION',
          params: { type: 'EXPENSE', amount: 45000, description: 'Cà phê', jarCode: 'essentials', transactionDate: '2026-05-05' },
        })
        .expect(200);
    });

    it('returns 400 when type is not a known action type', async () => {
      await request(app.getHttpServer())
        .post('/ai/actions/execute')
        .send({ type: 'DELETE_EVERYTHING', params: {} })
        .expect(400);
      expect(aiService.executeAction).not.toHaveBeenCalled();
    });

    it('returns 400 when params is missing', async () => {
      await request(app.getHttpServer())
        .post('/ai/actions/execute')
        .send({ type: 'CREATE_TRANSACTION' })
        .expect(400);
      expect(aiService.executeAction).not.toHaveBeenCalled();
    });
  });

  describe('POST /ai/actions/confirm', () => {
    const proposal = {
      type: 'CREATE_TRANSACTION',
      title: 'Tạo giao dịch',
      description: 'Cà phê 45.000đ',
      params: { amount: 45000 },
      riskLevel: 'low',
    };

    it('returns 200 with confirmed/dismissed proposals', async () => {
      aiService.confirmActions.mockResolvedValue({ results: [{ type: 'CREATE_TRANSACTION', success: true, message: 'OK' }] });
      await request(app.getHttpServer())
        .post('/ai/actions/confirm')
        .send({ confirmed: [proposal], dismissed: [] })
        .expect(200);
    });

    it('returns 400 when confirmed is missing', async () => {
      await request(app.getHttpServer()).post('/ai/actions/confirm').send({ dismissed: [] }).expect(400);
      expect(aiService.confirmActions).not.toHaveBeenCalled();
    });
  });

  describe('GET /ai/anomalies', () => {
    it('returns 200 with the alert list', async () => {
      aiService.getAnomalyAlerts.mockResolvedValue([{ id: 'alert-1' }]);
      await request(app.getHttpServer()).get('/ai/anomalies?moduleType=6jars&isRead=false').expect(200);
      expect(aiService.getAnomalyAlerts).toHaveBeenCalledWith('user-1', expect.objectContaining({ moduleType: '6jars', isRead: false }));
    });
  });

  describe('PATCH /ai/anomalies/:id/read', () => {
    it('returns 200 on success', async () => {
      aiService.markAlertRead.mockResolvedValue(undefined);
      await request(app.getHttpServer()).patch('/ai/anomalies/11111111-1111-4111-8111-111111111111/read').expect(200);
    });

    it('returns 400 when the id is not a UUID', async () => {
      await request(app.getHttpServer()).patch('/ai/anomalies/not-a-uuid/read').expect(400);
      expect(aiService.markAlertRead).not.toHaveBeenCalled();
    });
  });

  describe('POST /ai/callback (internal, AiServiceGuard)', () => {
    it('returns 200 with a valid insight callback', async () => {
      aiService.handleAiCallback.mockResolvedValue({ queued: true });
      const res = await request(app.getHttpServer())
        .post('/ai/callback')
        .send({
          event_type: 'insight',
          user_id: '11111111-1111-4111-8111-111111111111',
          title: 'Nhận xét tài chính tuần này',
          body: 'Chi tiêu lọ thiết yếu tăng nhẹ tuần này.',
        })
        .expect(200);
      expect(res.body.data.queued).toBe(true);
    });

    it('returns 400 when event_type is not "insight"', async () => {
      await request(app.getHttpServer())
        .post('/ai/callback')
        .send({ event_type: 'other', user_id: '11111111-1111-4111-8111-111111111111', title: 'X', body: 'Y' })
        .expect(400);
      expect(aiService.handleAiCallback).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the AiServiceGuard denies the request', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [AiController],
        providers: [{ provide: AiService, useValue: aiService }],
      })
        .overrideGuard(StackAuthGuard)
        .useValue(passUser)
        .overrideGuard(AiServiceGuard)
        .useValue({ canActivate: () => { throw new UnauthorizedException('Invalid AI service callback token'); } })
        .compile();
      const deniedApp = moduleRef.createNestApplication();
      deniedApp.useGlobalFilters(new HttpExceptionFilter());
      deniedApp.useGlobalInterceptors(new TransformInterceptor());
      await deniedApp.init();

      await request(deniedApp.getHttpServer())
        .post('/ai/callback')
        .send({ event_type: 'insight', user_id: '11111111-1111-4111-8111-111111111111', title: 'X', body: 'Y' })
        .expect(401);
      await deniedApp.close();
    });
  });

  it('rejects /ai/chat with 401 when unauthenticated', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    })
      .overrideGuard(StackAuthGuard)
      .useValue({ canActivate: () => { throw new UnauthorizedException(); } })
      .overrideGuard(AiServiceGuard)
      .useValue(passAiService)
      .compile();
    const unauthedApp = moduleRef.createNestApplication();
    unauthedApp.useGlobalFilters(new HttpExceptionFilter());
    unauthedApp.useGlobalInterceptors(new TransformInterceptor());
    await unauthedApp.init();
    await request(unauthedApp.getHttpServer()).post('/ai/chat').send({ message: 'hi' }).expect(401);
    await unauthedApp.close();
  });
});
