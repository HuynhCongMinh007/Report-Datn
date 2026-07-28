import { HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiController } from './ai.controller';

describe('AiController', () => {
  let controller: AiController;

  const aiService = {
    handleAiCallback: jest.fn(),
    chat: jest.fn(),
    chatStream: jest.fn(),
    listChatSessions: jest.fn(),
    getChatMessages: jest.fn(),
    getLatestScholarshipFitAnalysis: jest.fn(),
    analyzeScholarshipFit: jest.fn(),
    createScholarshipRecommendations: jest.fn(),
    loadMoreScholarshipRecommendations: jest.fn(),
    generateCareerRoadmap: jest.fn(),
    listCareerRoadmaps: jest.fn(),
    getCareerRoadmap: jest.fn(),
    deleteCareerRoadmap: jest.fn(),
    executeAction: jest.fn(),
    confirmActions: jest.fn(),
    startMockInterview: jest.fn(),
    answerMockInterview: jest.fn(),
    getMockInterviewSession: jest.fn(),
    getAnomalyAlerts: jest.fn(),
    markAlertRead: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(aiService as any);
  });

  it('aiCallback delegates to aiService.handleAiCallback', async () => {
    const dto = { eventType: 'anomaly' } as any;
    aiService.handleAiCallback.mockResolvedValue({ queued: true });

    const result = await controller.aiCallback(dto);

    expect(aiService.handleAiCallback).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({ data: { queued: true } });
  });

  it('chat delegates to aiService.chat with userId and dto', async () => {
    const dto = { message: 'xin chào' } as any;
    aiService.chat.mockResolvedValue({ reply: 'ok' });

    const result = await controller.chat('user-1', dto);

    expect(aiService.chat).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ data: { reply: 'ok' } });
  });

  describe('chatStream (SSE)', () => {
    function makeMockResponse() {
      return {
        status: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        json: jest.fn(),
        on: jest.fn(),
      };
    }

    it('streams token events and ends the response on complete', async () => {
      const res = makeMockResponse();
      aiService.chatStream.mockReturnValue(
        new Observable((subscriber) => {
          subscriber.next({ type: 'token', data: { text: 'Xin' } });
          subscriber.next({ type: 'token', data: { text: 'chào' } });
          subscriber.complete();
        }),
      );

      await controller.chatStream('user-1', {} as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.write).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: token'));
      expect(res.end).toHaveBeenCalled();
    });

    it('writes a JSON error response when the stream errors before any event is sent', async () => {
      const res = makeMockResponse();
      const error: any = new Error('AI service unavailable');
      error.status = 503;
      aiService.chatStream.mockReturnValue(
        new Observable((subscriber) => {
          subscriber.error(error);
        }),
      );

      await controller.chatStream('user-1', {} as any, res as any);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 503, message: 'AI service unavailable' }),
      );
      expect(res.write).not.toHaveBeenCalled();
    });

    it('writes an SSE error event when the stream errors after headers were already sent', async () => {
      const res = makeMockResponse();
      aiService.chatStream.mockReturnValue(
        new Observable((subscriber) => {
          subscriber.next({ type: 'token', data: { text: 'Xin' } });
          subscriber.error(new Error('stream interrupted'));
        }),
      );

      await controller.chatStream('user-1', {} as any, res as any);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
      expect(res.end).toHaveBeenCalled();
    });
  });

  it('listSessions delegates to aiService.listChatSessions', async () => {
    aiService.listChatSessions.mockResolvedValue([{ id: 'session-1' }]);

    const result = await controller.listSessions('user-1');

    expect(aiService.listChatSessions).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ data: [{ id: 'session-1' }] });
  });

  it('getSessionMessages delegates to aiService.getChatMessages', async () => {
    aiService.getChatMessages.mockResolvedValue([{ id: 'msg-1' }]);

    const result = await controller.getSessionMessages('user-1', 'session-1');

    expect(aiService.getChatMessages).toHaveBeenCalledWith('user-1', 'session-1');
    expect(result).toMatchObject({ data: [{ id: 'msg-1' }] });
  });

  it('getLatestScholarshipFitAnalysis delegates with optional sessionId', async () => {
    aiService.getLatestScholarshipFitAnalysis.mockResolvedValue(null);

    const result = await controller.getLatestScholarshipFitAnalysis('user-1', 'scholarship-1', 'session-1');

    expect(aiService.getLatestScholarshipFitAnalysis).toHaveBeenCalledWith('user-1', 'scholarship-1', 'session-1');
    expect(result).toMatchObject({ data: null });
  });

  it('analyzeScholarshipFit delegates to aiService.analyzeScholarshipFit', async () => {
    const dto = { note: 'x' } as any;
    aiService.analyzeScholarshipFit.mockResolvedValue({ score: 0.8 });

    const result = await controller.analyzeScholarshipFit('user-1', 'scholarship-1', dto);

    expect(aiService.analyzeScholarshipFit).toHaveBeenCalledWith('user-1', 'scholarship-1', dto);
    expect(result).toMatchObject({ data: { score: 0.8 } });
  });

  it('createScholarshipRecommendations delegates to aiService.createScholarshipRecommendations', async () => {
    const dto = {} as any;
    aiService.createScholarshipRecommendations.mockResolvedValue({ items: [] });

    await controller.createScholarshipRecommendations('user-1', dto);

    expect(aiService.createScholarshipRecommendations).toHaveBeenCalledWith('user-1', dto);
  });

  it('loadMoreScholarshipRecommendations delegates with recommendationSessionId', async () => {
    const dto = {} as any;
    aiService.loadMoreScholarshipRecommendations.mockResolvedValue({ items: [] });

    await controller.loadMoreScholarshipRecommendations('user-1', 'rec-session-1', dto);

    expect(aiService.loadMoreScholarshipRecommendations).toHaveBeenCalledWith('user-1', 'rec-session-1', dto);
  });

  it('generateCareerRoadmap delegates to aiService.generateCareerRoadmap', async () => {
    const dto = {} as any;
    aiService.generateCareerRoadmap.mockResolvedValue({ id: 'roadmap-1' });

    await controller.generateCareerRoadmap('user-1', dto);

    expect(aiService.generateCareerRoadmap).toHaveBeenCalledWith('user-1', dto);
  });

  it('listCareerRoadmaps delegates to aiService.listCareerRoadmaps', async () => {
    aiService.listCareerRoadmaps.mockResolvedValue([]);

    await controller.listCareerRoadmaps('user-1');

    expect(aiService.listCareerRoadmaps).toHaveBeenCalledWith('user-1');
  });

  it('getCareerRoadmap delegates to aiService.getCareerRoadmap', async () => {
    aiService.getCareerRoadmap.mockResolvedValue({ id: 'roadmap-1' });

    await controller.getCareerRoadmap('user-1', 'roadmap-1');

    expect(aiService.getCareerRoadmap).toHaveBeenCalledWith('user-1', 'roadmap-1');
  });

  it('deleteCareerRoadmap delegates to aiService.deleteCareerRoadmap and returns success payload', async () => {
    aiService.deleteCareerRoadmap.mockResolvedValue(undefined);

    const result = await controller.deleteCareerRoadmap('user-1', 'roadmap-1');

    expect(aiService.deleteCareerRoadmap).toHaveBeenCalledWith('user-1', 'roadmap-1');
    expect(result).toMatchObject({ data: { success: true, id: 'roadmap-1' } });
  });

  it('executeAction delegates to aiService.executeAction', async () => {
    const dto = { actionType: 'CREATE_TRANSACTION' } as any;
    aiService.executeAction.mockResolvedValue({ success: true });

    const result = await controller.executeAction('user-1', dto);

    expect(aiService.executeAction).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ data: { success: true } });
  });

  it('confirmActions delegates to aiService.confirmActions', async () => {
    const dto = { actionIds: ['a-1'] } as any;
    aiService.confirmActions.mockResolvedValue({ confirmed: 1 });

    const result = await controller.confirmActions('user-1', dto);

    expect(aiService.confirmActions).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ data: { confirmed: 1 } });
  });

  it('startMockInterview delegates to aiService.startMockInterview', async () => {
    const dto = {} as any;
    aiService.startMockInterview.mockResolvedValue({ sessionId: 'mi-1' });

    await controller.startMockInterview('user-1', dto);

    expect(aiService.startMockInterview).toHaveBeenCalledWith('user-1', dto);
  });

  it('answerMockInterview delegates to aiService.answerMockInterview', async () => {
    const dto = {} as any;
    aiService.answerMockInterview.mockResolvedValue({ nextQuestion: 'x' });

    await controller.answerMockInterview('user-1', dto);

    expect(aiService.answerMockInterview).toHaveBeenCalledWith('user-1', dto);
  });

  it('getMockInterviewSession delegates to aiService.getMockInterviewSession', async () => {
    aiService.getMockInterviewSession.mockResolvedValue({ sessionId: 'mi-1' });

    await controller.getMockInterviewSession('user-1', 'mi-1');

    expect(aiService.getMockInterviewSession).toHaveBeenCalledWith('user-1', 'mi-1');
  });

  it('getAnomalies delegates to aiService.getAnomalyAlerts with query', async () => {
    aiService.getAnomalyAlerts.mockResolvedValue([{ id: 'alert-1' }]);
    const query = { moduleType: 'SIX_JARS', isRead: false } as any;

    const result = await controller.getAnomalies('user-1', query);

    expect(aiService.getAnomalyAlerts).toHaveBeenCalledWith('user-1', query);
    expect(result).toMatchObject({ data: [{ id: 'alert-1' }] });
  });

  it('getAnomalies works with an empty query (no moduleType/isRead filter)', async () => {
    aiService.getAnomalyAlerts.mockResolvedValue([]);

    const result = await controller.getAnomalies('user-1', {} as any);

    expect(aiService.getAnomalyAlerts).toHaveBeenCalledWith('user-1', {});
    expect(result).toMatchObject({ data: [] });
  });

  it('markAlertRead delegates to aiService.markAlertRead and returns success payload', async () => {
    aiService.markAlertRead.mockResolvedValue(undefined);

    const result = await controller.markAlertRead('user-1', 'alert-1');

    expect(aiService.markAlertRead).toHaveBeenCalledWith('user-1', 'alert-1');
    expect(result).toMatchObject({ data: { success: true, alertId: 'alert-1' } });
  });
});
