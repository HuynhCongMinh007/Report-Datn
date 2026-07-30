/**
 * Unit tests for AiService — focusing on one-touch execution (Thực thi một chạm) behavior.
 *
 * Kiểm tra:
 * 1. chatStream() truyền enable_actions=false mặc định khi DTO không set enableActions
 * 2. chatStream() truyền enable_actions=true khi enableActions=true trong DTO
 * 3. Backend không tự động gọi executeAction khi AI trả về actionHint=true
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { ExecutableActionType } from './dtos/execute-action.dto';
import { AiChatSession, AiModuleType } from '@/database/entities/ai_core/ai-chat-session.entity';
import { AiMessage } from '@/database/entities/ai_core/ai-message.entity';
import { AiMessageRole } from '@/database/entities/ai_core/ai-message.entity';
import { AiAnomalyAlert } from '@/database/entities/ai_core/ai-anomaly-alert.entity';
import { AiUsageLog } from '@/database/entities/ai_core/ai-usage-log.entity';
import { AiCareerRoadmap } from '@/database/entities/ai_core/ai-career-roadmap.entity';
import { AiScholarshipFitAnalysis } from '@/database/entities/ai_core/ai-scholarship-fit-analysis.entity';
import { Scholarship } from '@/database/entities/scholarship/scholarship.entity';
import { ScholarshipRequirement } from '@/database/entities/scholarship/scholarship-requirement.entity';
import { User } from '@/database/entities/profile/user.entity';
import { FinancialTransactionsService } from '@/modules/financial-transactions/financial-transactions.service';
import { JarsService } from '@/modules/jars/jars.service';
import { AutoTransferSchedulesService } from '@/modules/auto-transfer-schedules/auto-transfer-schedules.service';
import { NotificationQueueService } from '@/modules/notification/service/notification.queue.service';
import { ChatRequestDto } from './dtos/chat-request.dto';

// Mock fetch at module level
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const makeSSEBody = (events: Array<{ type: string; data: object }>) => {
  let text = '';
  for (const ev of events) {
    text += `event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`;
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);

  let offset = 0;
  const readable = new ReadableStream({
    pull(controller) {
      if (offset < encoded.length) {
        controller.enqueue(encoded.slice(offset));
        offset = encoded.length;
      } else {
        controller.close();
      }
    },
  });

  return readable;
};

describe('AiService — chatStream (one-touch execution)', () => {
  let service: AiService;

  const mockChatSessionRepo = {
    findOneBy: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((v) => Promise.resolve({ id: 'sess-001', ...v })),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((v) => v),
  };

  const mockChatMessageRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockImplementation((v) => v),
  };

  const mockAnomalyAlertRepo = {
    find: jest.fn().mockResolvedValue([]),
  };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };

  const mockUserRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockFinancialTransactionsService = {
    createTransaction: jest.fn(),
  };

  const mockJarsService = {
    getUserJars: jest.fn(),
    getJarDetail: jest.fn(),
    getJarTags: jest.fn(),
  };

  const mockAutoTransferSchedulesService = {
    create: jest.fn(),
  };

  const mockNotificationQueueService = {
    createNewJob: jest.fn(),
  };

  const mockCareerRoadmapRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockScholarshipFitRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
    create: jest.fn().mockImplementation((v) => v),
  };

  const mockScholarshipRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockScholarshipRequirementRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);

    process.env.AI_SERVICE_URL = 'http://ai-service-mock';
    process.env.AI_SERVICE_SECRET = 'mock-secret';
  });

  /**
   * Capture the JSON payload sent to the AI service via fetch.
   */
  const capturePayloadAndSimulateStream = (
    doneEventData: object = { sessionId: 'sess-001', actionHint: false, actions: [] },
  ) => {
    let capturedPayload: Record<string, unknown> | null = null;

    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      capturedPayload = JSON.parse(opts.body as string);
      return Promise.resolve({
        ok: true,
        body: makeSSEBody([
          { type: 'done', data: doneEventData },
        ]),
      });
    });

    return () => capturedPayload;
  };

  it('passes enable_actions=false by default when DTO.enableActions is not set', (done) => {
    const getPayload = capturePayloadAndSimulateStream();

    const dto: ChatRequestDto = {
      message: 'Tôi vừa chi 200k vào đồ ăn sáng',
    };

    const stream$ = service.chatStream('user-abc', dto);

    stream$.subscribe({
      next: () => {},
      error: done,
      complete: () => {
        const payload = getPayload();
        expect(payload).not.toBeNull();
        expect(payload!['enable_actions']).toBe(false);
        done();
      },
    });
  });

  it('passes enable_actions=true when DTO.enableActions is true', (done) => {
    const getPayload = capturePayloadAndSimulateStream({ sessionId: 'sess-001', actionHint: false, actions: [] });

    const dto: ChatRequestDto = {
      message: 'Tôi vừa chi 200k vào đồ ăn sáng',
      enableActions: true,
    };

    const stream$ = service.chatStream('user-abc', dto);

    stream$.subscribe({
      next: () => {},
      error: done,
      complete: () => {
        const payload = getPayload();
        expect(payload).not.toBeNull();
        expect(payload!['enable_actions']).toBe(true);
        done();
      },
    });
  });

  it('emits done event with actionHint=true when AI service returns actionHint=true', (done) => {
    capturePayloadAndSimulateStream({
      sessionId: 'sess-001',
      actionHint: true,
      actions: [],
      intent: null,
      answerMode: null,
      agentUsed: [],
      providerUsed: 'vertexai',
      modelUsed: 'gemini-2.5-flash-lite',
    });

    const dto: ChatRequestDto = {
      message: 'Tôi vừa chi 200k vào đồ ăn sáng',
      enableActions: false,
    };

    const emittedEvents: Array<{ type: string; data: unknown }> = [];
    const stream$ = service.chatStream('user-abc', dto);

    stream$.subscribe({
      next: (event) => emittedEvents.push(event),
      error: done,
      complete: () => {
        const doneEvent = emittedEvents.find((e) => e.type === 'done');
        expect(doneEvent).toBeDefined();
        expect((doneEvent!.data as Record<string, unknown>)['actionHint']).toBe(true);
        done();
      },
    });
  });

  it('sends user_id in the upstream payload', (done) => {
    const getPayload = capturePayloadAndSimulateStream();
    const userId = 'user-xyz-123';

    const dto: ChatRequestDto = {
      message: 'Xin chào',
    };

    const stream$ = service.chatStream(userId, dto);

    stream$.subscribe({
      next: () => {},
      error: done,
      complete: () => {
        const payload = getPayload();
        expect(payload!['user_id']).toBe(userId);
        done();
      },
    });
  });

  // AIChat-TC006: khi luồng SSE kết thúc mà không có token nội dung nào (chỉ có
  // sự kiện 'done'), backend phải lưu lại một câu trả lời mặc định thay vì để
  // trống, để lịch sử trò chuyện không có tin nhắn trợ lý rỗng.
  it('persists a default fallback reply when the stream completes with no content tokens', (done) => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        body: makeSSEBody([{ type: 'done', data: { sessionId: 'sess-001', actionHint: false, actions: [] } }]),
      }),
    );

    const dto: ChatRequestDto = { message: 'Tư vấn giúp tôi cách chi tiêu hợp lý' };

    const stream$ = service.chatStream('user-abc', dto);

    stream$.subscribe({
      next: () => {},
      error: done,
      complete: () => {
        expect(mockChatMessageRepo.save).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              role: AiMessageRole.ASSISTANT,
              content: 'Xin lỗi, tôi chưa nhận được phản hồi từ AI. Vui lòng thử lại sau ít phút.',
            }),
          ]),
        );
        done();
      },
    });
  });
});

describe('AiService — getChatMessages (lịch sử trò chuyện)', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn() };
  const mockChatMessageRepo = { find: jest.fn() };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = { createTransaction: jest.fn() };
  const mockJarsService = { getUserJars: jest.fn(), getJarDetail: jest.fn(), getJarTags: jest.fn() };
  const mockAutoTransferSchedulesService = { create: jest.fn() };
  const mockNotificationQueueService = { createNewJob: jest.fn() };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = { findOne: jest.fn() };
  const mockScholarshipRepo = { findOne: jest.fn() };
  const mockScholarshipRequirementRepo = { find: jest.fn() };
  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('rejects fetching messages for a session that does not exist', async () => {
    mockChatSessionRepo.findOneBy.mockResolvedValue(null);

    await expect(service.getChatMessages('user-1', 'sess-missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects fetching messages for a session owned by a different user', async () => {
    mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'other-user' });

    await expect(service.getChatMessages('user-1', 'sess-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns the ordered message history for an owned session', async () => {
    mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
    mockChatMessageRepo.find.mockResolvedValue([
      {
        id: 'msg-1',
        role: AiMessageRole.USER,
        content: 'Số dư lọ thiết yếu còn bao nhiêu?',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        toolCalls: null,
      },
      {
        id: 'msg-2',
        role: AiMessageRole.ASSISTANT,
        content: 'Lọ Thiết yếu còn 1.200.000đ',
        createdAt: new Date('2026-07-01T00:00:05.000Z'),
        toolCalls: null,
      },
    ]);

    const result = await service.getChatMessages('user-1', 'sess-1');

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].content).toBe('Lọ Thiết yếu còn 1.200.000đ');
  });
});

describe('AiService — executeAction (thực thi một chạm — CREATE_TRANSACTION)', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn().mockResolvedValue(null) };
  const mockChatMessageRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = { createTransaction: jest.fn() };
  const mockJarsService = { getUserJars: jest.fn(), getJarDetail: jest.fn(), getJarTags: jest.fn() };
  const mockAutoTransferSchedulesService = { create: jest.fn() };
  const mockNotificationQueueService = { createNewJob: jest.fn() };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = { findOne: jest.fn() };
  const mockScholarshipRepo = { findOne: jest.fn() };
  const mockScholarshipRequirementRepo = { find: jest.fn() };
  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('rejects a CREATE_TRANSACTION action without a jarCode', async () => {
    await expect(
      service.executeAction('user-1', {
        type: ExecutableActionType.CREATE_TRANSACTION,
        params: { amount: 50000, type: 'EXPENSE' },
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('normalizes the legacy "savings" jar code to "reserve" before creating the transaction', async () => {
    mockJarsService.getJarDetail.mockResolvedValue({ id: 'jar-reserve' });
    mockFinancialTransactionsService.createTransaction.mockResolvedValue({ id: 'tx-1' });

    const result = await service.executeAction('user-1', {
      type: ExecutableActionType.CREATE_TRANSACTION,
      params: {
        amount: 200000,
        type: 'EXPENSE',
        jarCode: 'savings',
        transactionDate: '2026-07-01T00:00:00.000Z',
      },
    } as any);

    expect(mockJarsService.getJarDetail).toHaveBeenCalledWith('user-1', 'reserve');
    expect(result.success).toBe(true);
  });

  it('creates a real transaction through FinancialTransactionsService for a valid jarCode', async () => {
    mockJarsService.getJarDetail.mockResolvedValue({ id: 'jar-essentials' });
    mockFinancialTransactionsService.createTransaction.mockResolvedValue({ id: 'tx-2', amount: 45000 });

    const result = await service.executeAction('user-1', {
      type: ExecutableActionType.CREATE_TRANSACTION,
      params: {
        amount: 45000,
        type: 'EXPENSE',
        jarCode: 'essentials',
        description: 'Cà phê',
        transactionDate: '2026-07-01T00:00:00.000Z',
      },
    } as any);

    expect(mockFinancialTransactionsService.createTransaction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ amount: 45000, moneyJarId: 'jar-essentials' }),
    );
    expect(result.data).toEqual({ id: 'tx-2', amount: 45000 });
  });
});

describe('AiService — chat / listChatSessions / handleAiCallback', () => {
  let service: AiService;

  const mockChatSessionRepo = {
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn((v: any) => v),
    save: jest.fn(),
  };
  const mockChatMessageRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((v) => v),
  };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = { createTransaction: jest.fn() };
  const mockJarsService = { getUserJars: jest.fn(), getJarDetail: jest.fn(), getJarTags: jest.fn() };
  const mockAutoTransferSchedulesService = { create: jest.fn() };
  const mockNotificationQueueService = { createNewJob: jest.fn().mockResolvedValue(undefined) };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = { findOne: jest.fn() };
  const mockScholarshipRepo = { findOne: jest.fn() };
  const mockScholarshipRequirementRepo = { find: jest.fn() };
  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token'), verify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockChatSessionRepo.create.mockImplementation((v: any) => v);
    mockChatSessionRepo.save.mockImplementation((v: any) => Promise.resolve({ id: v.id ?? 'sess-new', ...v }));
    mockChatMessageRepo.save.mockResolvedValue(undefined);
    mockChatMessageRepo.create.mockImplementation((v: any) => v);
    mockNotificationQueueService.createNewJob.mockResolvedValue(undefined);
    mockJwtService.sign.mockReturnValue('mock-jwt-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    process.env.AI_SERVICE_URL = 'http://ai-service-mock';
    process.env.AI_SERVICE_SECRET = 'mock-secret';
  });

  describe('chat (non-streaming)', () => {
    it('rejects when the requested session belongs to a different user', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'other-user' });

      await expect(
        service.chat('user-1', { message: 'Xin chào', sessionId: 'sess-1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('proxies the message to the AI service and persists both user/assistant messages', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          reply: 'Tháng này bạn nên tiết kiệm 20%.',
          session_id: 'sess-new',
          usage: { tokens_in: 10, tokens_out: 20, latency_ms: 500 },
          intent: 'personal_finance',
          provider_used: 'vertexai',
        }),
      });

      const result = await service.chat('user-1', { message: 'Tháng này tôi nên tiết kiệm bao nhiêu?' } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://ai-service-mock/api/v1/chat',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.reply).toBe('Tháng này bạn nên tiết kiệm 20%.');
      expect(result.sessionId).toBe('sess-new');
      expect(result.usage).toEqual({ tokensIn: 10, tokensOut: 20 });
      expect(mockChatMessageRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ role: AiMessageRole.USER, content: 'Tháng này tôi nên tiết kiệm bao nhiêu?' }),
        expect.objectContaining({ role: AiMessageRole.ASSISTANT, content: 'Tháng này bạn nên tiết kiệm 20%.' }),
      ]);
    });

    it('re-throws when the AI service proxy call fails', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue(null);
      mockFetch.mockRejectedValue(new Error('network error'));

      await expect(
        service.chat('user-1', { message: 'Xin chào' } as any),
      ).rejects.toThrow();
    });

    it('summarizes a prior ACTION-role message into history instead of forwarding raw JSON', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
      mockChatMessageRepo.find.mockResolvedValue([
        {
          role: AiMessageRole.ACTION,
          content: JSON.stringify({ confirmed: [{ type: 'CREATE_TRANSACTION' }], dismissed: [] }),
          toolCalls: null,
        },
      ]);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ reply: 'Đã ghi nhận.', session_id: 'sess-1' }),
      });

      await service.chat('user-1', { message: 'Cảm ơn', sessionId: 'sess-1' } as any);

      const [, requestInit] = mockFetch.mock.calls[0];
      const payload = JSON.parse(requestInit.body);
      expect(payload.history[0].content).toContain('CREATE_TRANSACTION');
    });
  });

  describe('listChatSessions', () => {
    it('maps each session to a preview using its most recent message', async () => {
      const qb: Record<string, jest.Mock> = {};
      ['leftJoinAndMapMany', 'where', 'orderBy', 'take'].forEach((m) => {
        qb[m] = jest.fn().mockReturnValue(qb);
      });
      qb.getMany = jest.fn().mockResolvedValue([
        {
          id: 'sess-1',
          title: 'Tư vấn tiết kiệm',
          moduleType: 'six_jars',
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          messages: [{ content: 'Tháng này bạn nên tiết kiệm 20%.', createdAt: new Date('2026-07-01T00:00:05.000Z') }],
        },
      ]);
      mockChatSessionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listChatSessions('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ sessionId: 'sess-1', title: 'Tư vấn tiết kiệm', topic: 'finance' });
    });

    it('falls back to a default title/empty preview when the session has no title or messages', async () => {
      const qb: Record<string, jest.Mock> = {};
      ['leftJoinAndMapMany', 'where', 'orderBy', 'take'].forEach((m) => {
        qb[m] = jest.fn().mockReturnValue(qb);
      });
      qb.getMany = jest.fn().mockResolvedValue([
        { id: 'sess-2', title: null, moduleType: 'six_jars', updatedAt: new Date('2026-07-01T00:00:00.000Z'), messages: [] },
      ]);
      mockChatSessionRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listChatSessions('user-1');

      expect(result[0].title).toBe('Phiên chat mới');
      expect(result[0].preview).toBe('');
    });
  });

  describe('handleAiCallback', () => {
    it('rejects an unsupported callback event type', async () => {
      await expect(
        service.handleAiCallback({ event_type: 'other', user_id: 'user-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the user has no linked account', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-1', account: null });

      await expect(
        service.handleAiCallback({ event_type: 'insight', user_id: 'user-1' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('queues a push notification for the linked account', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-1', account: { accountId: 'acc-1' } });

      const result = await service.handleAiCallback({
        event_type: 'insight',
        user_id: 'user-1',
        title: 'Báo cáo tháng',
        body: 'Xem phân tích chi tiêu tháng này',
        navigate_to: 's360://finance/report',
      } as any);

      expect(mockNotificationQueueService.createNewJob).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ['acc-1'], title: 'Báo cáo tháng' }),
      );
      expect(result).toEqual({ queued: true });
    });
  });
});

describe('AiService — executeAction (các action type còn lại) & confirmActions', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(undefined) };
  const mockChatMessageRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((v) => v),
  };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = {
    createTransaction: jest.fn(),
    distributeIncome: jest.fn(),
    deleteTransaction: jest.fn(),
  };
  const mockJarsService = {
    getUserJars: jest.fn(),
    getJarDetail: jest.fn(),
    getJarTags: jest.fn(),
    getJars: jest.fn(),
    updateJarPercentages: jest.fn(),
  };
  const mockAutoTransferSchedulesService = {
    create: jest.fn(),
    createSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
    toggleActive: jest.fn(),
    updateSchedule: jest.fn(),
    getSchedules: jest.fn(),
  };
  const mockNotificationQueueService = { createNewJob: jest.fn() };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = { findOne: jest.fn() };
  const mockScholarshipRepo = { findOne: jest.fn() };
  const mockScholarshipRequirementRepo = { find: jest.fn() };
  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('DISTRIBUTE_INCOME', () => {
    it('distributes income across jars via FinancialTransactionsService', async () => {
      mockFinancialTransactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]);

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.DISTRIBUTE_INCOME,
        params: { amount: 5000000, transactionDate: '2026-07-01T00:00:00.000Z' },
      } as any);

      expect(mockFinancialTransactionsService.distributeIncome).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ amount: 5000000 }),
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ id: 'tx-1' }, { id: 'tx-2' }]);
    });
  });

  describe('TRANSFER_BETWEEN_JARS', () => {
    it('rejects when sourceJarCode or targetJarCode is missing', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.TRANSFER_BETWEEN_JARS,
          params: { amount: 100000 },
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('transfers between the resolved source and target jars', async () => {
      mockJarsService.getJarDetail
        .mockResolvedValueOnce({ id: 'jar-essentials', name: 'Thiết yếu' })
        .mockResolvedValueOnce({ id: 'jar-reserve', name: 'Dự phòng' });
      mockFinancialTransactionsService.createTransaction.mockResolvedValue({ id: 'tx-transfer' });

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.TRANSFER_BETWEEN_JARS,
        params: {
          amount: 300000,
          sourceJarCode: 'essentials',
          targetJarCode: 'reserve',
          transactionDate: '2026-07-01T00:00:00.000Z',
        },
      } as any);

      expect(mockFinancialTransactionsService.createTransaction).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ moneyJarId: 'jar-essentials', counterpartJarId: 'jar-reserve' }),
      );
      expect(result.message).toContain('Thiết yếu');
      expect(result.message).toContain('Dự phòng');
    });
  });

  describe('UPDATE_ALLOCATION', () => {
    it('rejects when no jars array is provided', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.UPDATE_ALLOCATION,
          params: {},
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when none of the provided jar codes can be resolved', async () => {
      mockJarsService.getJars.mockResolvedValue([{ code: 'essentials', id: 'jar-1' }]);

      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.UPDATE_ALLOCATION,
          params: { jars: [{ code: 'unknown', percentage: 100 }] },
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves jar codes to ids and updates percentages', async () => {
      mockJarsService.getJars.mockResolvedValue([
        { code: 'essentials', id: 'jar-1' },
        { code: 'reserve', id: 'jar-2' },
      ]);
      mockJarsService.updateJarPercentages.mockResolvedValue(undefined);

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.UPDATE_ALLOCATION,
        params: {
          jars: [
            { code: 'essentials', percentage: 60 },
            { code: 'reserve', percentage: 40 },
          ],
        },
      } as any);

      expect(mockJarsService.updateJarPercentages).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          jars: [
            { categoryId: 'jar-1', percentage: 60 },
            { categoryId: 'jar-2', percentage: 40 },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('CREATE_AUTO_TRANSFER_SCHEDULE', () => {
    it('rejects an invalid/missing frequency', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.CREATE_AUTO_TRANSFER_SCHEDULE,
          params: { amount: 1000000 },
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects SINGLE_JAR allocation without a targetJarCode', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.CREATE_AUTO_TRANSFER_SCHEDULE,
          params: { amount: 1000000, frequency: 'monthly' },
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a schedule targeting a resolved jar', async () => {
      mockJarsService.getJarDetail.mockResolvedValue({ id: 'jar-1' });
      mockAutoTransferSchedulesService.createSchedule.mockResolvedValue({ id: 'sched-1' });

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.CREATE_AUTO_TRANSFER_SCHEDULE,
        params: { amount: 1000000, frequency: 'monthly', targetJarCode: 'essentials', dayOfMonth: 1 },
      } as any);

      expect(mockAutoTransferSchedulesService.createSchedule).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ targetJarId: 'jar-1', frequency: 'monthly' }),
      );
      expect(result.success).toBe(true);
    });

    it('defaults to DEFAULT allocation type when none/invalid is provided (no target jar required)', async () => {
      mockAutoTransferSchedulesService.createSchedule.mockResolvedValue({ id: 'sched-2' });

      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.CREATE_AUTO_TRANSFER_SCHEDULE,
          params: { amount: 1000000, frequency: 'monthly', allocationType: 'default' },
        } as any),
      ).resolves.toMatchObject({ success: true });
      expect(mockJarsService.getJarDetail).not.toHaveBeenCalled();
    });
  });

  describe('resolveScheduleId (qua DELETE/TOGGLE/UPDATE_AUTO_TRANSFER_SCHEDULE)', () => {
    it('uses scheduleId directly when provided', async () => {
      mockAutoTransferSchedulesService.deleteSchedule.mockResolvedValue(undefined);

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.DELETE_AUTO_TRANSFER_SCHEDULE,
        params: { scheduleId: 'sched-1' },
      } as any);

      expect(mockAutoTransferSchedulesService.deleteSchedule).toHaveBeenCalledWith('sched-1', 'user-1');
      expect(result.success).toBe(true);
    });

    it('rejects when neither scheduleId nor scheduleName is provided', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.TOGGLE_AUTO_TRANSFER_SCHEDULE,
          params: {},
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves scheduleName to an id by case-insensitive substring match', async () => {
      mockAutoTransferSchedulesService.getSchedules.mockResolvedValue([
        { id: 'sched-1', name: 'Lương hàng tháng' },
      ]);
      mockAutoTransferSchedulesService.toggleActive.mockResolvedValue({ id: 'sched-1', isActive: false });

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.TOGGLE_AUTO_TRANSFER_SCHEDULE,
        params: { scheduleName: 'lương' },
      } as any);

      expect(mockAutoTransferSchedulesService.toggleActive).toHaveBeenCalledWith('sched-1', 'user-1');
      expect(result.message).toContain('tạm dừng');
    });

    it('throws NotFoundException when no schedule matches the given name', async () => {
      mockAutoTransferSchedulesService.getSchedules.mockResolvedValue([{ id: 'sched-1', name: 'Lương hàng tháng' }]);

      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.UPDATE_AUTO_TRANSFER_SCHEDULE,
          params: { scheduleName: 'không tồn tại', amount: 100 },
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE_TRANSACTION', () => {
    it('rejects when transactionId is missing', async () => {
      await expect(
        service.executeAction('user-1', {
          type: ExecutableActionType.DELETE_TRANSACTION,
          params: {},
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes the given transaction', async () => {
      mockFinancialTransactionsService.deleteTransaction.mockResolvedValue(undefined);

      const result = await service.executeAction('user-1', {
        type: ExecutableActionType.DELETE_TRANSACTION,
        params: { transactionId: 'tx-1' },
      } as any);

      expect(mockFinancialTransactionsService.deleteTransaction).toHaveBeenCalledWith('user-1', 'tx-1');
      expect(result.success).toBe(true);
    });
  });

  describe('unsupported action type', () => {
    it('rejects an unrecognized action type', async () => {
      await expect(
        service.executeAction('user-1', { type: 'NOT_A_REAL_ACTION', params: {} } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmActions', () => {
    it('executes each confirmed action and collects per-action success/failure results', async () => {
      mockFinancialTransactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }]);

      const result = await service.confirmActions('user-1', {
        confirmed: [
          { type: ExecutableActionType.DISTRIBUTE_INCOME, params: { amount: 1000000, transactionDate: '2026-07-01T00:00:00.000Z' } },
          { type: ExecutableActionType.TRANSFER_BETWEEN_JARS, params: { amount: 100000 } }, // missing codes -> fails
        ],
        dismissed: [],
      } as any);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({ success: true });
      expect(result.results[1]).toMatchObject({ success: false });
    });

    it('persists an ACTION history message and touches the session when sessionId is provided', async () => {
      mockFinancialTransactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }]);

      await service.confirmActions('user-1', {
        sessionId: 'sess-1',
        confirmed: [
          { type: ExecutableActionType.DISTRIBUTE_INCOME, params: { amount: 1000000, transactionDate: '2026-07-01T00:00:00.000Z' } },
        ],
        dismissed: [],
      } as any);

      expect(mockChatMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'sess-1', role: AiMessageRole.ACTION }),
      );
      expect(mockChatSessionRepo.update).toHaveBeenCalledWith(
        { id: 'sess-1', userId: 'user-1' },
        expect.objectContaining({ updatedAt: expect.any(Date) }),
      );
    });

    it('does not touch chat history when no sessionId is provided', async () => {
      mockFinancialTransactionsService.distributeIncome.mockResolvedValue([{ id: 'tx-1' }]);

      await service.confirmActions('user-1', {
        confirmed: [
          { type: ExecutableActionType.DISTRIBUTE_INCOME, params: { amount: 1000000, transactionDate: '2026-07-01T00:00:00.000Z' } },
        ],
        dismissed: [],
      } as any);

      expect(mockChatMessageRepo.save).not.toHaveBeenCalled();
      expect(mockChatSessionRepo.update).not.toHaveBeenCalled();
    });
  });
});

describe('AiService — scholarship fit analysis', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn() };
  const mockChatMessageRepo = { createQueryBuilder: jest.fn(), save: jest.fn() };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = { createTransaction: jest.fn() };
  const mockJarsService = { getUserJars: jest.fn(), getJarDetail: jest.fn(), getJarTags: jest.fn() };
  const mockAutoTransferSchedulesService = { create: jest.fn() };
  const mockNotificationQueueService = { createNewJob: jest.fn() };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn((v: any) => v),
  };
  const mockScholarshipRepo = { findOne: jest.fn() };
  const mockScholarshipRequirementRepo = { find: jest.fn() };
  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token'), verify: jest.fn() };

  const makeFitQueryBuilderMock = (result: any) => {
    const qb: Record<string, jest.Mock> = {};
    ['where', 'andWhere', 'orderBy', 'addOrderBy'].forEach((m) => {
      qb[m] = jest.fn().mockReturnValue(qb);
    });
    qb.getOne = jest.fn().mockResolvedValue(result);
    return qb;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockScholarshipFitRepo.create.mockImplementation((v: any) => v);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    process.env.AI_SERVICE_URL = 'http://ai-service-mock';
    process.env.AI_SERVICE_SECRET = 'mock-secret';
  });

  describe('getLatestScholarshipFitAnalysis', () => {
    it('returns null when there is no usable cached analysis', async () => {
      mockScholarshipFitRepo.createQueryBuilder.mockReturnValue(makeFitQueryBuilderMock(null));

      const result = await service.getLatestScholarshipFitAnalysis('user-1', 'sch-1');

      expect(result).toBeNull();
    });

    it('maps the cached record to a DTO with cached=true when found', async () => {
      mockScholarshipFitRepo.createQueryBuilder.mockReturnValue(
        makeFitQueryBuilderMock({
          id: 'analysis-1',
          scholarshipId: 'sch-1',
          userId: 'user-1',
          sessionId: null,
          fitLevel: 'high',
          fitLabel: 'Rất phù hợp',
          fitScore: 90,
          summary: 'Phù hợp tốt',
          reasons: [],
          actions: [],
          hardBlockers: [],
          profileSnapshot: {},
          scholarshipSnapshot: {},
          generatedAt: new Date('2026-07-01T00:00:00.000Z'),
          expiresAt: null,
        }),
      );

      const result = await service.getLatestScholarshipFitAnalysis('user-1', 'sch-1');

      expect(result).toMatchObject({ analysisId: 'analysis-1', cached: true, fitLevel: 'high' });
    });
  });

  describe('analyzeScholarshipFit', () => {
    it('throws NotFoundException when the given sessionId does not exist', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.analyzeScholarshipFit('user-1', 'sch-1', { sessionId: 'sess-x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the session belongs to a different user', async () => {
      mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'other-user' });

      await expect(
        service.analyzeScholarshipFit('user-1', 'sch-1', { sessionId: 'sess-1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the cached analysis without calling the AI service when forceRefresh is not set', async () => {
      mockScholarshipFitRepo.createQueryBuilder.mockReturnValue(
        makeFitQueryBuilderMock({
          id: 'analysis-1',
          scholarshipId: 'sch-1',
          userId: 'user-1',
          sessionId: null,
          fitLevel: 'medium',
          fitLabel: 'Phù hợp vừa',
          fitScore: 60,
          summary: 'Tạm ổn',
          reasons: [],
          actions: [],
          hardBlockers: [],
          profileSnapshot: {},
          scholarshipSnapshot: {},
          generatedAt: new Date('2026-07-01T00:00:00.000Z'),
          expiresAt: null,
        }),
      );

      const result = await service.analyzeScholarshipFit('user-1', 'sch-1', {} as any);

      expect(result.cached).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('generates a new analysis via the AI service, persists it and attaches it to the latest assistant message', async () => {
      mockScholarshipFitRepo.createQueryBuilder.mockReturnValue(makeFitQueryBuilderMock(null));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          analysis_id: 'analysis-2',
          scholarship_id: 'sch-1',
          user_id: 'user-1',
          session_id: 'sess-1',
          fit_level: 'high',
          fit_score: 85,
          summary: 'Rất phù hợp với hồ sơ',
          reasons: [],
          actions: [],
          generated_at: '2026-07-10T00:00:00.000Z',
        }),
      });
      mockScholarshipFitRepo.save.mockImplementation((v: any) => Promise.resolve(v));
      mockChatSessionRepo.findOneBy.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
      const messageQb: Record<string, jest.Mock> = {};
      ['where', 'andWhere', 'orderBy'].forEach((m) => {
        messageQb[m] = jest.fn().mockReturnValue(messageQb);
      });
      messageQb.getOne = jest.fn().mockResolvedValue({
        id: 'msg-1',
        sessionId: 'sess-1',
        toolCalls: null,
      });
      mockChatMessageRepo.createQueryBuilder.mockReturnValue(messageQb);
      mockChatMessageRepo.save.mockResolvedValue(undefined);

      const result = await service.analyzeScholarshipFit(
        'user-1',
        'sch-1',
        { sessionId: 'sess-1', forceRefresh: true } as any,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://ai-service-mock/api/v1/scholarships/sch-1/fit-analysis',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockScholarshipFitRepo.save).toHaveBeenCalled();
      expect(mockChatMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCalls: expect.arrayContaining([
            expect.objectContaining({ type: 'scholarshipFitAnalysis' }),
          ]),
        }),
      );
      expect(result.analysisId).toBe('analysis-2');
      expect(result.cached).toBe(false);
    });

    it('throws InternalServerErrorException when the AI service returns an invalid payload', async () => {
      mockScholarshipFitRepo.createQueryBuilder.mockReturnValue(makeFitQueryBuilderMock(null));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ summary: 'thiếu các trường bắt buộc' }),
      });

      await expect(
        service.analyzeScholarshipFit('user-1', 'sch-1', {} as any),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});

describe('AiService — classify/insights proxy, anomaly alerts & scholarship recommendations', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn() };
  const mockChatMessageRepo = { save: jest.fn(), create: jest.fn((v: any) => v) };
  const mockAnomalyAlertRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v: any) => v),
    save: jest.fn(),
  };
  const mockAiUsageLogRepo = { create: jest.fn((v: any) => v), save: jest.fn().mockResolvedValue(undefined) };
  const mockUserRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const mockFinancialTransactionsService = { createTransaction: jest.fn() };
  const mockJarsService = { getUserJars: jest.fn(), getJarDetail: jest.fn(), getJarTags: jest.fn() };
  const mockAutoTransferSchedulesService = { create: jest.fn() };
  const mockNotificationQueueService = { createNewJob: jest.fn() };
  const mockCareerRoadmapRepo = { findOne: jest.fn() };
  const mockScholarshipFitRepo = { findOne: jest.fn() };
  const mockScholarshipRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
  const mockScholarshipRequirementRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const mockDataSource = {};
  const mockJwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token'), verify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockAnomalyAlertRepo.create.mockImplementation((v: any) => v);
    mockScholarshipRepo.find.mockResolvedValue([]);
    mockScholarshipRequirementRepo.find.mockResolvedValue([]);
    mockCacheManager.get.mockResolvedValue(undefined);
    mockCacheManager.set.mockResolvedValue(undefined);
    mockCacheManager.del.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: getRepositoryToken(AiAnomalyAlert), useValue: mockAnomalyAlertRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockAiUsageLogRepo },
        { provide: getRepositoryToken(AiCareerRoadmap), useValue: mockCareerRoadmapRepo },
        { provide: getRepositoryToken(AiChatSession), useValue: mockChatSessionRepo },
        { provide: getRepositoryToken(AiMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(AiScholarshipFitAnalysis), useValue: mockScholarshipFitRepo },
        { provide: getRepositoryToken(Scholarship), useValue: mockScholarshipRepo },
        { provide: getRepositoryToken(ScholarshipRequirement), useValue: mockScholarshipRequirementRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FinancialTransactionsService, useValue: mockFinancialTransactionsService },
        { provide: JarsService, useValue: mockJarsService },
        { provide: AutoTransferSchedulesService, useValue: mockAutoTransferSchedulesService },
        { provide: NotificationQueueService, useValue: mockNotificationQueueService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    process.env.AI_SERVICE_URL = 'http://ai-service-mock';
    process.env.AI_SERVICE_SECRET = 'mock-secret';
  });

  describe('classifyText', () => {
    it('maps the snake_case AI response to camelCase', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          suggested_jar_code: 'NEC',
          suggested_tag_slug: 'an-uong',
          suggested_tag_name: 'Ăn uống',
          confidence: 0.92,
          source: 'ai',
        }),
      });

      const result = await service.classifyText({
        userId: 'user-1',
        description: 'Ăn sáng',
        amount: 30000,
        systemPrompt: 'prompt',
      });

      expect(result).toEqual({
        jarCode: 'NEC',
        tagSlug: 'an-uong',
        tagName: 'Ăn uống',
        confidence: 0.92,
        source: 'ai',
      });
    });

    it('falls back to a safe default without throwing when the AI proxy call fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await service.classifyText({
        userId: 'user-1',
        description: 'Ăn sáng',
        systemPrompt: 'prompt',
      });

      expect(result).toEqual({ jarCode: null, confidence: 0, source: 'ai' });
    });
  });

  describe('classifyOverride', () => {
    it('resolves when the AI service accepts the override', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204, text: jest.fn() });

      await expect(
        service.classifyOverride({ userId: 'user-1', keyword: 'grab', jarCode: 'PLAY' }),
      ).resolves.toBeUndefined();
    });

    it('re-throws when the AI service proxy call fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      await expect(
        service.classifyOverride({ userId: 'user-1', keyword: 'grab', jarCode: 'PLAY' }),
      ).rejects.toThrow();
    });
  });

  describe('getFinanceInsights', () => {
    it('returns the parsed insights payload on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          insight: 'Bạn đang chi tiêu hợp lý',
          month: 7,
          year: 2026,
          generated_at: '2026-07-01T00:00:00.000Z',
          fallback_used: false,
        }),
      });

      const result = await service.getFinanceInsights({ userId: 'user-1', month: 7, year: 2026 });

      expect(result.insight).toBe('Bạn đang chi tiêu hợp lý');
      expect(result.fallback_used).toBe(false);
    });

    it('re-throws when the AI service returns a non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('boom'),
      });

      await expect(
        service.getFinanceInsights({ userId: 'user-1', month: 7, year: 2026 }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getAnomalyAlerts', () => {
    it('maps the snake_case alert list to camelCase entities', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue([
          {
            id: 'alert-1',
            user_id: 'user-1',
            module_type: 'six_jars',
            alert_type: 'overspend',
            target_id: 'tx-1',
            description: 'Chi tiêu bất thường',
            is_read: false,
            created_at: '2026-07-01T00:00:00.000Z',
          },
        ]),
      });

      const result = await service.getAnomalyAlerts('user-1', {} as any);

      expect(result).toEqual([
        expect.objectContaining({ id: 'alert-1', userId: 'user-1', moduleType: 'six_jars', isRead: false }),
      ]);
    });

    it('re-throws when the AI service proxy call fails', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      await expect(service.getAnomalyAlerts('user-1', {} as any)).rejects.toThrow();
    });
  });

  describe('markAlertRead', () => {
    it('calls the AI service PATCH endpoint with the alert id and user id', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204, text: jest.fn() });

      await service.markAlertRead('user-1', 'alert-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/anomalies/alert-1/read?user_id=user-1'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('saveAnomalyAlert', () => {
    it('creates and persists a new anomaly alert', async () => {
      mockAnomalyAlertRepo.save.mockResolvedValue({ id: 'alert-1', description: 'Chi tiêu bất thường' });

      const result = await service.saveAnomalyAlert({ description: 'Chi tiêu bất thường' });

      expect(mockAnomalyAlertRepo.create).toHaveBeenCalledWith({ description: 'Chi tiêu bất thường' });
      expect(result).toEqual({ id: 'alert-1', description: 'Chi tiêu bất thường' });
    });
  });

  describe('proxyRequest (via classifyOverride)', () => {
    const originalAiServiceUrl = process.env.AI_SERVICE_URL;

    afterEach(() => {
      process.env.AI_SERVICE_URL = originalAiServiceUrl ?? 'http://ai-service-mock';
    });

    it('throws InternalServerErrorException when AI_SERVICE_URL is not configured', async () => {
      delete process.env.AI_SERVICE_URL;

      await expect(
        service.classifyOverride({ userId: 'user-1', keyword: 'grab', jarCode: 'PLAY' }),
      ).rejects.toThrow();
    });

    it('preserves the upstream error detail when the AI service returns a JSON error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue(JSON.stringify({ detail: 'Invalid jar code' })),
      });

      await expect(
        service.classifyOverride({ userId: 'user-1', keyword: 'grab', jarCode: 'INVALID' }),
      ).rejects.toThrow('Invalid jar code');
    });
  });

  describe('createScholarshipRecommendations / loadMoreScholarshipRecommendations (happy path)', () => {
    const upstreamItem = (id: string, title: string) => ({ id, title });

    it('creates a recommendation session and returns the first page of items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          reply: 'Đây là các học bổng phù hợp với bạn.',
          scholarship_recommendations: {
            kind: 'scholarship_recommendations',
            items: [upstreamItem('sch-1', 'Học bổng ABC'), upstreamItem('sch-2', 'Học bổng XYZ')],
          },
        }),
      });

      const result = await service.createScholarshipRecommendations('user-1', {
        source: 'scholarship_list',
        limit: 2,
      } as any);

      expect(result.reply).toBe('Đây là các học bổng phù hợp với bạn.');
      expect(result.scholarshipRecommendations?.items).toHaveLength(2);
      expect(result.scholarshipRecommendations?.recommendationSessionId).toEqual(expect.any(String));
    });

    it('paginates further results using the session created by createScholarshipRecommendations', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          reply: 'Đây là các học bổng phù hợp với bạn.',
          scholarship_recommendations: {
            kind: 'scholarship_recommendations',
            items: [upstreamItem('sch-1', 'Học bổng ABC')],
            ordered_scholarship_ids: ['sch-1', 'sch-2', 'sch-3'],
          },
        }),
      });

      const created = await service.createScholarshipRecommendations('user-1', {
        source: 'scholarship_list',
        limit: 1,
      } as any);
      const sessionId = created.scholarshipRecommendations!.recommendationSessionId!;

      const more = await service.loadMoreScholarshipRecommendations('user-1', sessionId, {
        limit: 1,
      } as any);

      expect(more.scholarshipRecommendations?.returnedCount).toBeGreaterThanOrEqual(0);
      expect(more.scholarshipRecommendations?.recommendationSessionId).toBe(sessionId);
    });

    it('throws ForbiddenException when the recommendation session belongs to another user', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          reply: 'ok',
          scholarship_recommendations: {
            kind: 'scholarship_recommendations',
            items: [upstreamItem('sch-1', 'Học bổng ABC')],
          },
        }),
      });

      const created = await service.createScholarshipRecommendations('user-1', {
        source: 'scholarship_list',
        limit: 1,
      } as any);
      const sessionId = created.scholarshipRecommendations!.recommendationSessionId!;

      await expect(
        service.loadMoreScholarshipRecommendations('other-user', sessionId, { limit: 1 } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws an HttpException (410 Gone) when the recommendation session does not exist', async () => {
      await expect(
        service.loadMoreScholarshipRecommendations('user-1', 'unknown-session', { limit: 1 } as any),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('private normalization/mapping helpers (direct branch coverage)', () => {
    const call = (method: string, ...args: any[]) => (service as any)[method](...args);

    describe('asOptionalString', () => {
      it('returns null for null/undefined', () => {
        expect(call('asOptionalString', null)).toBeNull();
        expect(call('asOptionalString', undefined)).toBeNull();
      });
      it('returns null for a blank/whitespace-only string', () => {
        expect(call('asOptionalString', '   ')).toBeNull();
      });
      it('trims and returns a non-empty string', () => {
        expect(call('asOptionalString', '  abc  ')).toBe('abc');
      });
      it('coerces non-string values to string', () => {
        expect(call('asOptionalString', 42)).toBe('42');
      });
    });

    describe('asStringArray', () => {
      it('returns [] when the value is not an array', () => {
        expect(call('asStringArray', 'not-an-array')).toEqual([]);
      });
      it('filters out blank/null items and keeps valid strings', () => {
        expect(call('asStringArray', ['a', '', null, '  b  ', undefined])).toEqual(['a', 'b']);
      });
    });

    describe('asOptionalNumber', () => {
      it('returns null for null/undefined/empty string', () => {
        expect(call('asOptionalNumber', null)).toBeNull();
        expect(call('asOptionalNumber', undefined)).toBeNull();
        expect(call('asOptionalNumber', '')).toBeNull();
      });
      it('returns null for a non-numeric string', () => {
        expect(call('asOptionalNumber', 'abc')).toBeNull();
      });
      it('parses a numeric string or number', () => {
        expect(call('asOptionalNumber', '42')).toBe(42);
        expect(call('asOptionalNumber', 42)).toBe(42);
      });
    });

    describe('normalizeRecommendationBasis', () => {
      it.each([
        ['latest', 'latest'],
        ['criteria', 'criteria'],
        ['described_profile_match', 'described_profile_match'],
        ['anything-else', 'profile_match'],
        [undefined, 'profile_match'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeRecommendationBasis', input)).toBe(expected);
      });
    });

    describe('normalizeCompetitionLevel', () => {
      it.each([
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['bogus', 'unknown'],
        [undefined, 'unknown'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeCompetitionLevel', input)).toBe(expected);
      });
    });

    describe('normalizeCompetitionBasis', () => {
      it.each([
        ['applicants_per_slot', 'applicants_per_slot'],
        ['applicants_count', 'applicants_count'],
        ['bogus', 'unknown'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeCompetitionBasis', input)).toBe(expected);
      });
    });

    describe('normalizeRecurrenceType', () => {
      it('returns the value directly when already recurring/one_time', () => {
        expect(call('normalizeRecurrenceType', 'recurring')).toBe('recurring');
        expect(call('normalizeRecurrenceType', 'one_time')).toBe('one_time');
      });
      it('falls back to recurring when legacyIsRecurring=true', () => {
        expect(call('normalizeRecurrenceType', undefined, true)).toBe('recurring');
      });
      it('falls back to unknown otherwise', () => {
        expect(call('normalizeRecurrenceType', undefined, false)).toBe('unknown');
        expect(call('normalizeRecurrenceType', 'bogus', undefined)).toBe('unknown');
      });
    });

    describe('normalizeRecommendationStrategy', () => {
      it.each([
        ['apply_now', 'apply_now'],
        ['prepare_ahead', 'prepare_ahead'],
        ['historical_only', 'historical_only'],
        ['bogus', 'apply_now'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeRecommendationStrategy', input)).toBe(expected);
      });
    });

    describe('normalizeFitReasons', () => {
      it('returns [] when raw is not an array', () => {
        expect(call('normalizeFitReasons', 'nope')).toEqual([]);
      });
      it('skips non-object items and items without a message', () => {
        expect(
          call('normalizeFitReasons', [null, 'string-item', { code: 'x' }]),
        ).toEqual([]);
      });
      it('normalizes a valid reason, defaulting code/severity when missing', () => {
        expect(
          call('normalizeFitReasons', [{ message: 'GPA thấp' }]),
        ).toEqual([
          { code: 'unknown', severity: 'unknown', message: 'GPA thấp', evidence: null },
        ]);
      });
    });

    describe('normalizeFitActions', () => {
      it('returns [] when raw is not an array', () => {
        expect(call('normalizeFitActions', null)).toEqual([]);
      });
      it('skips non-object items and items without a message', () => {
        expect(call('normalizeFitActions', [42, {}])).toEqual([]);
      });
      it('normalizes a valid action, defaulting code/priority when missing', () => {
        expect(call('normalizeFitActions', [{ message: 'Nộp minh chứng' }])).toEqual([
          { code: 'next_step', priority: 'medium', message: 'Nộp minh chứng' },
        ]);
      });
    });

    describe('normalizeFitLevel / defaultFitLabel', () => {
      it.each([
        ['high', 'high', 'Cao'],
        ['medium', 'medium', 'Trung bình'],
        ['low', 'low', 'Thấp'],
        ['impossible', 'impossible', 'Không thể nộp'],
        ['bogus', 'low', 'Thấp'],
      ])('%s -> level=%s, label=%s', (input, expectedLevel, expectedLabel) => {
        expect(call('normalizeFitLevel', input)).toBe(expectedLevel);
        expect(call('defaultFitLabel', input)).toBe(expectedLabel);
      });
    });

    describe('normalizeReasonSeverity', () => {
      it.each([
        ['positive', 'positive'],
        ['warning', 'warning'],
        ['improvable', 'improvable'],
        ['blocker', 'blocker'],
        ['unknown', 'unknown'],
        ['bogus', 'unknown'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeReasonSeverity', input)).toBe(expected);
      });
    });

    describe('normalizeActionPriority', () => {
      it.each([
        ['high', 'high'],
        ['medium', 'medium'],
        ['low', 'low'],
        ['bogus', 'medium'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('normalizeActionPriority', input)).toBe(expected);
      });
    });

    describe('clampScore', () => {
      it('returns 0 for non-numeric input', () => {
        expect(call('clampScore', 'abc')).toBe(0);
      });
      it('clamps negative values to 0', () => {
        expect(call('clampScore', -10)).toBe(0);
      });
      it('clamps values above 100 to 100', () => {
        expect(call('clampScore', 150)).toBe(100);
      });
      it('rounds a normal value', () => {
        expect(call('clampScore', 55.6)).toBe(56);
      });
    });

    describe('asObject', () => {
      it('returns {} for null, arrays, and non-objects', () => {
        expect(call('asObject', null)).toEqual({});
        expect(call('asObject', [1, 2])).toEqual({});
        expect(call('asObject', 'str')).toEqual({});
      });
      it('returns the object as-is', () => {
        expect(call('asObject', { a: 1 })).toEqual({ a: 1 });
      });
    });

    describe('toSnakeRecommendationSnapshot', () => {
      it('returns undefined when snapshot is undefined', () => {
        expect(call('toSnakeRecommendationSnapshot', undefined)).toBeUndefined();
      });
      it('maps camelCase fields to snake_case', () => {
        expect(
          call('toSnakeRecommendationSnapshot', {
            id: 'sch-1',
            title: 'Học bổng A',
            importantRequirement: 'GPA >= 3.0',
            competitionLevel: 'low',
            applicantsCount: 10,
            quantity: 5,
            applicantsPerSlot: 2,
            competitionBasis: 'applicants_per_slot',
            recurrenceType: 'recurring',
            expectedNextOpenDate: '2027-01-01',
            recommendationStrategy: 'apply_now',
          }),
        ).toEqual({
          id: 'sch-1',
          title: 'Học bổng A',
          important_requirement: 'GPA >= 3.0',
          competition_level: 'low',
          applicants_count: 10,
          quantity: 5,
          applicants_per_slot: 2,
          competition_basis: 'applicants_per_slot',
          recurrence_type: 'recurring',
          expected_next_open_date: '2027-01-01',
          recommendation_strategy: 'apply_now',
        });
      });
    });

    describe('mapProvider', () => {
      it.each([
        ['google_ai_studio', 'gemini'],
        ['local', 'ollama'],
        ['vertexai', 'vertexai'],
        ['bogus', undefined],
        [undefined, undefined],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('mapProvider', input)).toBe(expected);
      });
    });

    describe('mapContextToModuleType', () => {
      it.each([
        ['finance', AiModuleType.SIX_JARS],
        ['debt', AiModuleType.DEBT],
        ['goal', AiModuleType.GOAL],
        ['investment', AiModuleType.INVESTMENT],
        ['bogus', AiModuleType.GENERAL],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('mapContextToModuleType', input)).toBe(expected);
      });
    });

    describe('mapModuleTypeToTopic', () => {
      it.each([
        [AiModuleType.SIX_JARS, 'finance'],
        [AiModuleType.DEBT, 'debt'],
        [AiModuleType.GOAL, 'goal'],
        [AiModuleType.INVESTMENT, 'investment'],
        [AiModuleType.CAREER, 'career'],
        ['bogus', 'finance'],
      ])('maps %s -> %s', (input, expected) => {
        expect(call('mapModuleTypeToTopic', input)).toBe(expected);
      });
    });

    describe('buildSessionTitle', () => {
      it('returns a default title for a blank message', () => {
        expect(call('buildSessionTitle', '   ')).toBe('Phiên chat mới');
      });
      it('returns the trimmed message when short enough', () => {
        expect(call('buildSessionTitle', '  Hỏi về học bổng  ')).toBe('Hỏi về học bổng');
      });
      it('truncates messages longer than 80 characters', () => {
        const long = 'a'.repeat(100);
        const result = call('buildSessionTitle', long);
        expect(result).toBe(`${'a'.repeat(80)}...`);
      });
    });

    describe('resolveScholarshipCompetition', () => {
      it('returns unknown when applicantsCount is missing', () => {
        expect(call('resolveScholarshipCompetition', undefined, 10)).toEqual({
          competitionLevel: 'unknown',
          applicantsCount: null,
          quantity: 10,
          applicantsPerSlot: null,
          competitionBasis: 'unknown',
        });
      });
      it('returns unknown when applicantsCount is negative, dropping a non-positive quantity', () => {
        expect(call('resolveScholarshipCompetition', -5, 0)).toEqual({
          competitionLevel: 'unknown',
          applicantsCount: null,
          quantity: null,
          applicantsPerSlot: null,
          competitionBasis: 'unknown',
        });
      });
      it('computes a low ratio level from applicants-per-slot when quantity > 0', () => {
        expect(call('resolveScholarshipCompetition', 3, 10)).toEqual({
          competitionLevel: 'low',
          applicantsCount: 3,
          quantity: 10,
          applicantsPerSlot: 0.3,
          competitionBasis: 'applicants_per_slot',
        });
      });
      it('computes a medium ratio level from applicants-per-slot', () => {
        const result = call('resolveScholarshipCompetition', 100, 10);
        expect(result.competitionLevel).toBe('medium');
        expect(result.competitionBasis).toBe('applicants_per_slot');
      });
      it('computes a high ratio level from applicants-per-slot', () => {
        const result = call('resolveScholarshipCompetition', 300, 10);
        expect(result.competitionLevel).toBe('high');
      });
      it('falls back to applicants_count basis (low) when quantity is absent', () => {
        const result = call('resolveScholarshipCompetition', 100, null);
        expect(result).toEqual({
          competitionLevel: 'low',
          applicantsCount: 100,
          quantity: null,
          applicantsPerSlot: null,
          competitionBasis: 'applicants_count',
        });
      });
      it('computes a medium level purely by applicants count', () => {
        const result = call('resolveScholarshipCompetition', 500, undefined);
        expect(result.competitionLevel).toBe('medium');
        expect(result.competitionBasis).toBe('applicants_count');
      });
      it('computes a high level purely by applicants count', () => {
        const result = call('resolveScholarshipCompetition', 1500, undefined);
        expect(result.competitionLevel).toBe('high');
      });
    });

    describe('normalizedRecurrenceType', () => {
      it('returns the entity value directly when recurring/one_time', () => {
        expect(call('normalizedRecurrenceType', { recurrenceType: 'recurring' })).toBe('recurring');
        expect(call('normalizedRecurrenceType', { recurrenceType: 'one_time' })).toBe('one_time');
      });
      it('falls back to isRecurring flag', () => {
        expect(call('normalizedRecurrenceType', { recurrenceType: null, isRecurring: true })).toBe('recurring');
        expect(call('normalizedRecurrenceType', { recurrenceType: null, isRecurring: false })).toBe('unknown');
      });
    });

    describe('scholarshipRecommendationStrategy', () => {
      it('returns apply_now when active with no deadline', () => {
        expect(
          call('scholarshipRecommendationStrategy', { isActive: true, applicationDeadline: null }),
        ).toBe('apply_now');
      });
      it('returns apply_now when active and deadline is in the future', () => {
        const future = new Date(Date.now() + 86_400_000);
        expect(
          call('scholarshipRecommendationStrategy', { isActive: true, applicationDeadline: future }),
        ).toBe('apply_now');
      });
      it('returns prepare_ahead when closed but recurring', () => {
        const past = new Date(Date.now() - 86_400_000);
        expect(
          call('scholarshipRecommendationStrategy', {
            isActive: true,
            applicationDeadline: past,
            recurrenceType: 'recurring',
          }),
        ).toBe('prepare_ahead');
      });
      it('returns historical_only when inactive and not recurring', () => {
        expect(
          call('scholarshipRecommendationStrategy', {
            isActive: false,
            applicationDeadline: null,
            recurrenceType: null,
            isRecurring: false,
          }),
        ).toBe('historical_only');
      });
    });

    describe('countRemainingRecommendations', () => {
      it('counts ids after the cursor that have not been shown yet', () => {
        const session = {
          rankedScholarshipIds: ['a', 'b', 'c', 'd'],
          shownIds: ['c'],
          cursor: 1,
        };
        // slice(1) -> ['b','c','d'], minus shown 'c' -> ['b','d'] -> 2
        expect(call('countRemainingRecommendations', session)).toBe(2);
      });
    });

    describe('normalizeRecommendationLimit', () => {
      it('returns the default limit when input is not finite', () => {
        expect(call('normalizeRecommendationLimit', undefined)).toBe(3);
        expect(call('normalizeRecommendationLimit', NaN)).toBe(3);
      });
      it('floors and clamps to the [1, max] range', () => {
        expect(call('normalizeRecommendationLimit', 0)).toBe(1);
        expect(call('normalizeRecommendationLimit', 2.9)).toBe(2);
        expect(call('normalizeRecommendationLimit', 10)).toBe(5);
      });
    });

    describe('uniqueIds', () => {
      it('deduplicates and drops falsy entries', () => {
        expect(call('uniqueIds', ['a', 'b', 'a', null, undefined, ''])).toEqual(['a', 'b']);
      });
    });

    describe('cleanupExpiredRecommendationSessions', () => {
      it('removes only sessions whose expiresAt has passed', () => {
        const sessions: Map<string, any> = (service as any).recommendationSessions;
        sessions.set('expired', { expiresAt: new Date(Date.now() - 1000) });
        sessions.set('active', { expiresAt: new Date(Date.now() + 100_000) });

        call('cleanupExpiredRecommendationSessions');

        expect(sessions.has('expired')).toBe(false);
        expect(sessions.has('active')).toBe(true);
      });
    });

    describe('recommendationCacheKey', () => {
      it('builds a namespaced cache key', () => {
        expect(call('recommendationCacheKey', 'sess-1')).toBe('recommendation:sess-1');
      });
    });

    describe('hydrateRecommendationSession', () => {
      it('returns undefined for null/non-object input', () => {
        expect(call('hydrateRecommendationSession', null)).toBeUndefined();
      });
      it('hydrates dates and defaults missing collection/number fields', () => {
        const raw = {
          id: 'sess-1',
          userId: 'user-1',
          originalQuery: 'q',
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:30:00.000Z',
        };
        const result = call('hydrateRecommendationSession', raw);
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.rankedScholarshipIds).toEqual([]);
        expect(result.shownIds).toEqual([]);
        expect(result.cursor).toBe(0);
        expect(result.candidateCount).toBe(0);
        expect(result.scoreThreshold).toBeNull();
        expect(result.paginationSource).toBeNull();
      });
      it('preserves valid array/number/string fields when present', () => {
        const raw = {
          id: 'sess-1',
          userId: 'user-1',
          originalQuery: 'q',
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:30:00.000Z',
          rankedScholarshipIds: ['a', 'b'],
          shownIds: ['a'],
          cursor: 1,
          candidateCount: 5,
          scoreThreshold: 0.5,
          paginationSource: 'offset',
        };
        const result = call('hydrateRecommendationSession', raw);
        expect(result.rankedScholarshipIds).toEqual(['a', 'b']);
        expect(result.cursor).toBe(1);
        expect(result.scoreThreshold).toBe(0.5);
        expect(result.paginationSource).toBe('offset');
      });
    });

    describe('normalizeRecommendationText / tokenizeRecommendationText', () => {
      it('strips diacritics and lowercases', () => {
        expect(call('normalizeRecommendationText', 'Học Bổng')).toBe('hoc bong');
      });
      it('tokenizes, dropping stopwords and short tokens', () => {
        expect(call('tokenizeRecommendationText', 'Tìm học bổng công nghệ thông tin cho tôi')).toEqual([
          'cong', 'nghe', 'thong', 'tin',
        ]);
      });
    });

    describe('formatScholarshipCoverage', () => {
      it('formats the amount with currency when present', () => {
        expect(
          call('formatScholarshipCoverage', { amount: 5000000, currency: 'VND' }),
        ).toBe(`${new Intl.NumberFormat('vi-VN').format(5000000)} VND`);
      });
      it('formats the amount without a currency suffix when absent', () => {
        expect(
          call('formatScholarshipCoverage', { amount: 1000, currency: null }),
        ).toBe(new Intl.NumberFormat('vi-VN').format(1000));
      });
      it('falls back to the first benefit when there is no amount', () => {
        expect(
          call('formatScholarshipCoverage', { amount: null, benefits: ['Học phí', 'Ký túc xá'] }),
        ).toBe('Học phí');
      });
      it('returns null when there is neither an amount nor benefits', () => {
        expect(call('formatScholarshipCoverage', { amount: null, benefits: null })).toBeNull();
      });
    });

    describe('splitScholarshipText', () => {
      it('returns [] for null/undefined', () => {
        expect(call('splitScholarshipText', null)).toEqual([]);
        expect(call('splitScholarshipText', undefined)).toEqual([]);
      });
      it('trims and filters an array', () => {
        expect(call('splitScholarshipText', [' a ', '', ' b '])).toEqual(['a', 'b']);
      });
      it('splits a delimited string on newlines/semicolons/bullets/dashes', () => {
        expect(call('splitScholarshipText', 'Học phí\n Ký túc xá; Sách vở • Bảo hiểm - Đi lại')).toEqual([
          'Học phí', 'Ký túc xá', 'Sách vở', 'Bảo hiểm', 'Đi lại',
        ]);
      });
    });

    describe('buildAssistantMetadata', () => {
      it('returns null when there are no recommendations or roadmap', () => {
        expect(call('buildAssistantMetadata', undefined, undefined)).toBeNull();
      });
      it('omits scholarship recommendations with an empty items list', () => {
        expect(call('buildAssistantMetadata', { items: [] }, undefined)).toBeNull();
      });
      it('includes scholarship recommendations when items are present', () => {
        const recs = { items: [{ id: 'sch-1' }] };
        expect(call('buildAssistantMetadata', recs, undefined)).toEqual([
          { type: 'scholarshipRecommendations', data: recs },
        ]);
      });
      it('includes both recommendations and career roadmap when both are present', () => {
        const recs = { items: [{ id: 'sch-1' }] };
        const roadmap = { id: 'road-1' };
        expect(call('buildAssistantMetadata', recs, roadmap)).toEqual([
          { type: 'scholarshipRecommendations', data: recs },
          { type: 'careerRoadmap', data: roadmap },
        ]);
      });
    });

    describe('extractAssistantRecommendations', () => {
      it('returns undefined when toolCalls is not an array', () => {
        expect(call('extractAssistantRecommendations', null)).toBeUndefined();
      });
      it('returns undefined when no matching entry is found', () => {
        expect(call('extractAssistantRecommendations', [{ type: 'careerRoadmap', data: {} }])).toBeUndefined();
      });
      it('normalizes the matching entry data', () => {
        const toolCalls = [
          {
            type: 'scholarshipRecommendations',
            data: { kind: 'scholarship_recommendations', items: [{ id: 's1', title: 'Học bổng A' }] },
          },
        ];
        const result = call('extractAssistantRecommendations', toolCalls);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe('s1');
      });
    });

    describe('extractCareerRoadmap', () => {
      it('returns undefined when toolCalls is not an array', () => {
        expect(call('extractCareerRoadmap', null)).toBeUndefined();
      });
      it('returns undefined when no matching entry is found', () => {
        expect(call('extractCareerRoadmap', [{ type: 'scholarshipRecommendations', data: {} }])).toBeUndefined();
      });
      it('returns the data of the matching entry', () => {
        const roadmap = { id: 'road-1' };
        expect(call('extractCareerRoadmap', [{ type: 'careerRoadmap', data: roadmap }])).toBe(roadmap);
      });
    });

    describe('extractLangChainToolCalls', () => {
      it('returns null when toolCalls is not an array', () => {
        expect(call('extractLangChainToolCalls', null)).toBeNull();
      });
      it('keeps only entries shaped like real LangChain tool calls', () => {
        const toolCalls = [
          { type: 'scholarshipRecommendations', data: {} },
          { name: 'get_jar_balance', args: {} },
        ];
        expect(call('extractLangChainToolCalls', toolCalls)).toEqual([
          { name: 'get_jar_balance', args: {} },
        ]);
      });
      it('returns null when nothing matches the LangChain shape', () => {
        expect(call('extractLangChainToolCalls', [{ type: 'careerRoadmap', data: {} }])).toBeNull();
      });
    });

    describe('normalizeScholarshipRecommendations', () => {
      it('returns undefined when raw is not an object', () => {
        expect(call('normalizeScholarshipRecommendations', null)).toBeUndefined();
        expect(call('normalizeScholarshipRecommendations', 'nope')).toBeUndefined();
      });
      it('returns undefined when items is missing/empty', () => {
        expect(call('normalizeScholarshipRecommendations', { items: [] })).toBeUndefined();
        expect(call('normalizeScholarshipRecommendations', {})).toBeUndefined();
      });
      it('returns undefined when every item fails to normalize', () => {
        expect(
          call('normalizeScholarshipRecommendations', { items: [{ id: 'no-title' }] }),
        ).toBeUndefined();
      });
      it('normalizes a full payload with defaults for optional metadata', () => {
        const result = call('normalizeScholarshipRecommendations', {
          items: [{ id: 's1', title: 'Học bổng A' }],
        });
        expect(result.kind).toBe('scholarship_recommendations');
        expect(result.items).toHaveLength(1);
        expect(result.totalCount).toBe(1);
        expect(result.returnedCount).toBe(1);
        expect(result.hasMore).toBe(false);
        expect(result.basis).toBe('profile_match');
      });
      it('caps items at 8 and prefers explicit pagination metadata', () => {
        const items = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: `Học bổng ${i}` }));
        const result = call('normalizeScholarshipRecommendations', {
          items,
          total_count: 42,
          has_more: true,
          basis: 'latest',
        });
        expect(result.items).toHaveLength(8);
        expect(result.totalCount).toBe(42);
        expect(result.hasMore).toBe(true);
        expect(result.basis).toBe('latest');
      });
    });

    describe('mapMessageRoleToHistoryRole', () => {
      it('maps ACTION role to action', () => {
        expect(call('mapMessageRoleToHistoryRole', 'action')).toBe('action');
      });
      it('passes through user/assistant roles unchanged', () => {
        expect(call('mapMessageRoleToHistoryRole', 'user')).toBe('user');
        expect(call('mapMessageRoleToHistoryRole', 'assistant')).toBe('assistant');
      });
    });

    describe('scoreScholarshipCandidate', () => {
      it('returns 0 when the query has no meaningful tokens', () => {
        expect(call('scoreScholarshipCandidate', 'a', { name: 'Học bổng CNTT' })).toBe(0);
      });
      it('counts how many query tokens appear in the scholarship text', () => {
        const scholarship = {
          name: 'Học bổng Công nghệ thông tin',
          description: null,
          eligibilityCriteria: null,
          benefits: null,
          provider: null,
          category: { name: 'Công nghệ' },
          targetMajors: ['Khoa học máy tính'],
          targetUniversities: [],
        };
        const score = call('scoreScholarshipCandidate', 'học bổng công nghệ thông tin', scholarship);
        expect(score).toBeGreaterThan(0);
      });
    });

    describe('mapScholarshipToRecommendationItem', () => {
      it('maps a full scholarship + requirements into a recommendation item', () => {
        const scholarship = {
          id: 'sch-1',
          name: 'Học bổng Khuyến học',
          targetUniversities: ['Trường A'],
          provider: 'Quỹ ABC',
          providerOrganization: null,
          category: { name: 'Khuyến học' },
          targetMajors: ['CNTT'],
          amount: 3000000,
          currency: 'VND',
          benefits: null,
          eligibilityCriteria: 'Sinh viên năm 3',
          minimumGpa: 3.2,
          minimumGpaScale: 4,
          level: 'Đại học',
          applicationDeadline: new Date('2027-06-01T00:00:00.000Z'),
          expectedNextOpenDate: null,
          applicantsCount: 10,
          quantity: 5,
          isActive: true,
          recurrenceType: 'recurring',
          isRecurring: true,
        };
        const requirements = [
          { isRequired: true, title: 'Bảng điểm' },
          { isRequired: false, title: 'Thư giới thiệu' },
        ];
        const result = call('mapScholarshipToRecommendationItem', scholarship, requirements);
        expect(result.id).toBe('sch-1');
        expect(result.title).toBe('Học bổng Khuyến học');
        expect(result.importantRequirement).toBe('Bảng điểm');
        expect(result.requirements.gpa).toBe('GPA tối thiểu 3.2/4');
        expect(result.requirements.other).toEqual(['Bảng điểm']);
        expect(result.recurrenceType).toBe('recurring');
      });
      it('falls back to the first requirement and eligibility criteria when none are required', () => {
        const scholarship = {
          id: 'sch-2',
          name: 'Học bổng B',
          targetUniversities: [],
          provider: null,
          providerOrganization: { name: 'Tổ chức XYZ' },
          category: null,
          targetMajors: [],
          amount: null,
          currency: null,
          benefits: ['Học phí'],
          eligibilityCriteria: 'Không yêu cầu đặc biệt',
          minimumGpa: null,
          minimumGpaScale: null,
          level: null,
          applicationDeadline: null,
          expectedNextOpenDate: null,
          applicantsCount: null,
          quantity: null,
          isActive: false,
          recurrenceType: null,
          isRecurring: false,
        };
        const result = call('mapScholarshipToRecommendationItem', scholarship, []);
        expect(result.provider).toBe('Tổ chức XYZ');
        expect(result.importantRequirement).toBe('Không yêu cầu đặc biệt');
        expect(result.competitionLevel).toBe('unknown');
        expect(result.recurrenceType).toBe('unknown');
      });
    });

    describe('upsertSession', () => {
      it('creates a new session when sessionId is not provided', async () => {
        (mockChatSessionRepo as any).create = jest.fn((v: any) => v); (mockChatSessionRepo as any).save = jest.fn((v: any) => Promise.resolve(v));
        const result = await call('upsertSession', {
          userId: 'user-1',
          moduleType: AiModuleType.SIX_JARS,
          title: 'Phiên mới',
        });
        expect(result.userId).toBe('user-1');
        expect(mockChatSessionRepo.findOneBy).not.toHaveBeenCalled();
      });
      it('reuses and updates an existing session, keeping the existing title if set', async () => {
        const existing: any = { id: 'sess-1', title: 'Tiêu đề cũ', moduleType: AiModuleType.GENERAL };
        mockChatSessionRepo.findOneBy.mockResolvedValue(existing);
        (mockChatSessionRepo as any).create = jest.fn((v: any) => v); (mockChatSessionRepo as any).save = jest.fn((v: any) => Promise.resolve(v));
        const result = await call('upsertSession', {
          userId: 'user-1',
          sessionId: 'sess-1',
          moduleType: AiModuleType.SIX_JARS,
          title: 'Tiêu đề mới',
        });
        expect(result.title).toBe('Tiêu đề cũ');
        expect(result.moduleType).toBe(AiModuleType.SIX_JARS);
      });
      it('creates a fresh session when the given sessionId does not match an existing one', async () => {
        mockChatSessionRepo.findOneBy.mockResolvedValue(null);
        (mockChatSessionRepo as any).create = jest.fn((v: any) => v); (mockChatSessionRepo as any).save = jest.fn((v: any) => Promise.resolve(v));
        const result = await call('upsertSession', {
          userId: 'user-1',
          sessionId: 'missing-session',
          moduleType: AiModuleType.GENERAL,
          title: 'Tiêu đề',
        });
        expect(result.title).toBe('Tiêu đề');
      });
    });

    describe('parseReplyBlocks', () => {
      it('returns a single empty paragraph for empty text', () => {
        expect(call('parseReplyBlocks', '')).toEqual([{ type: 'paragraph', text: '' }]);
      });
      it('returns a single paragraph when there are no blank-line-separated chunks', () => {
        expect(call('parseReplyBlocks', '   ')).toEqual([{ type: 'paragraph', text: '   ' }]);
      });
      it('parses a bullet list chunk', () => {
        const result = call('parseReplyBlocks', '- Mục 1\n- Mục 2');
        expect(result).toEqual([{ type: 'bulletList', items: ['Mục 1', 'Mục 2'] }]);
      });
      it('parses a numbered list chunk', () => {
        const result = call('parseReplyBlocks', '1. Bước 1\n2. Bước 2');
        expect(result).toEqual([{ type: 'numberedList', items: ['Bước 1', 'Bước 2'] }]);
      });
      it('falls back to a paragraph for plain text', () => {
        const result = call('parseReplyBlocks', 'Xin chào\nBạn khỏe không');
        expect(result).toEqual([{ type: 'paragraph', text: 'Xin chào\nBạn khỏe không' }]);
      });
    });

    describe('recommendation session cache failure handling', () => {
      it('logs a warning and still resolves via memory when the cache read fails', async () => {
        mockCacheManager.get.mockRejectedValueOnce(new Error('cache down'));
        const result = await call('getRecommendationSession', 'missing-in-memory');
        expect(result).toBeUndefined();
      });
      it('logs a warning but does not throw when the cache write fails', async () => {
        mockCacheManager.set.mockRejectedValueOnce(new Error('cache down'));
        const session = {
          id: 'sess-1',
          userId: 'user-1',
          originalQuery: 'q',
          rankedScholarshipIds: [],
          shownIds: [],
          cursor: 0,
          candidateCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 100_000),
        };
        await expect(call('saveRecommendationSession', session)).resolves.toBeUndefined();
      });
      it('logs a warning but does not throw when the cache delete fails', async () => {
        mockCacheManager.del.mockRejectedValueOnce(new Error('cache down'));
        await expect(call('deleteRecommendationSession', 'sess-1')).resolves.toBeUndefined();
      });
    });

    describe('normalizeScholarshipRecommendationItem', () => {
      it('returns undefined when raw is not an object', () => {
        expect(call('normalizeScholarshipRecommendationItem', null)).toBeUndefined();
      });
      it('returns undefined when id or title is missing', () => {
        expect(call('normalizeScholarshipRecommendationItem', { title: 'x' })).toBeUndefined();
        expect(call('normalizeScholarshipRecommendationItem', { id: 'x' })).toBeUndefined();
      });
      it('normalizes a minimal valid item with empty requirements object', () => {
        const result = call('normalizeScholarshipRecommendationItem', { id: 's1', title: 'Học bổng A' });
        expect(result.id).toBe('s1');
        expect(result.requirements).toEqual({ gpa: null, language: null, yearLevel: null, other: [] });
      });
      it('normalizes a full item including nested requirements', () => {
        const result = call('normalizeScholarshipRecommendationItem', {
          id: 's1',
          title: 'Học bổng A',
          requirements: { gpa: '3.0', language: 'IELTS 6.0', year_level: 'Năm 3', other: ['CV'] },
          competition_level: 'high',
          recurrence_type: 'recurring',
        });
        expect(result.requirements).toEqual({
          gpa: '3.0', language: 'IELTS 6.0', yearLevel: 'Năm 3', other: ['CV'],
        });
        expect(result.competitionLevel).toBe('high');
        expect(result.recurrenceType).toBe('recurring');
      });
    });
  });
});
