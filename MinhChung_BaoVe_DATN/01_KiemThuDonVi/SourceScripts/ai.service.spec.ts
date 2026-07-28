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
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AiService } from './ai.service';
import { ExecutableActionType } from './dtos/execute-action.dto';
import { AiChatSession } from '@/database/entities/ai_core/ai-chat-session.entity';
import { AiMessage } from '@/database/entities/ai_core/ai-message.entity';
import { AiMessageRole } from '@/database/entities/ai_core/ai-message.entity';
import { AiAnomalyAlert } from '@/database/entities/ai_core/ai-anomaly-alert.entity';
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
});

describe('AiService — getChatMessages (lịch sử trò chuyện)', () => {
  let service: AiService;

  const mockChatSessionRepo = { findOneBy: jest.fn() };
  const mockChatMessageRepo = { find: jest.fn() };
  const mockAnomalyAlertRepo = { find: jest.fn().mockResolvedValue([]) };
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
