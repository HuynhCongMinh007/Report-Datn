import {
  AiFinanceInsightSnapshot,
  AiFinanceInsightStatus,
} from '@/database/entities/ai_core/ai-finance-insight-snapshot.entity';
import { InsightsService } from './insights.service';

describe('InsightsService', () => {
  const dto = { month: 6, year: 2026, timezone: 'Asia/Ho_Chi_Minh' };
  const aiResult = {
    insight: 'Dong tien dang trong tam kiem soat.',
    month: 6,
    year: 2026,
    generated_at: '2026-06-09T01:00:00.000Z',
    fallback_used: false,
  };

  const makeSnapshot = (
    overrides: Partial<AiFinanceInsightSnapshot> = {},
  ): AiFinanceInsightSnapshot =>
    ({
      id: 'snapshot-id',
      userId: 'user-id',
      month: 6,
      year: 2026,
      analysisDate: '2026-06-09',
      status: AiFinanceInsightStatus.COMPLETED,
      result: aiResult,
      generatedAt: new Date(aiResult.generated_at),
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as AiFinanceInsightSnapshot);

  const setup = () => {
    const aiService = {
      getFinanceInsights: jest.fn(),
    };
    const repository = {
      findForDate: jest.fn(),
      findLatest: jest.fn(),
      createGenerating: jest.fn(),
      acquireExisting: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = new InsightsService(
      aiService as never,
      repository as never,
    );
    return { service, aiService, repository };
  };

  it('returns the completed daily snapshot without calling AI', async () => {
    const { service, aiService, repository } = setup();
    repository.findForDate.mockResolvedValue(makeSnapshot());

    const result = await service.ensureInsights('user-id', dto);

    expect(result.cached).toBe(true);
    expect(result.result).toEqual(aiResult);
    expect(aiService.getFinanceInsights).not.toHaveBeenCalled();
  });

  it('generates and stores a snapshot when today is missing', async () => {
    const { service, aiService, repository } = setup();
    const generating = makeSnapshot({
      status: AiFinanceInsightStatus.GENERATING,
      result: null,
      generatedAt: null,
    });
    repository.findForDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(generating)
      .mockResolvedValueOnce(makeSnapshot());
    repository.createGenerating.mockResolvedValue(true);
    aiService.getFinanceInsights.mockResolvedValue(aiResult);

    const result = await service.ensureInsights('user-id', dto);

    expect(aiService.getFinanceInsights).toHaveBeenCalledTimes(1);
    expect(repository.markCompleted).toHaveBeenCalledWith(
      generating.id,
      aiResult,
      new Date(aiResult.generated_at),
    );
    expect(result.result).toEqual(aiResult);
  });

  it('keeps the previous result when a forced refresh fails', async () => {
    const { service, aiService, repository } = setup();
    const existing = makeSnapshot();
    repository.findForDate
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);
    repository.acquireExisting.mockResolvedValue(true);
    aiService.getFinanceInsights.mockRejectedValue(new Error('AI unavailable'));

    const result = await service.refreshInsights('user-id', dto);

    expect(repository.markFailed).toHaveBeenCalledWith(
      existing,
      'AI unavailable',
    );
    expect(result.result).toEqual(aiResult);
    expect(result.cached).toBe(true);
  });

  it('ensureInsights throws when the snapshot still cannot be found right after creation', async () => {
    const { service, repository } = setup();
    repository.findForDate.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.createGenerating.mockResolvedValue(true);

    await expect(service.ensureInsights('user-id', dto)).rejects.toThrow(
      'Finance insight snapshot was not created',
    );
  });

  it('refreshInsights throws when the snapshot still cannot be found right after creation', async () => {
    const { service, repository } = setup();
    repository.findForDate.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.createGenerating.mockResolvedValue(true);

    await expect(service.refreshInsights('user-id', dto)).rejects.toThrow(
      'Finance insight snapshot was not created',
    );
  });

  it('refreshInsights generates via AI when this call wins the race to create the daily row', async () => {
    const { service, aiService, repository } = setup();
    const generating = makeSnapshot({
      status: AiFinanceInsightStatus.GENERATING,
      result: null,
      generatedAt: null,
    });
    repository.findForDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(generating)
      .mockResolvedValueOnce(makeSnapshot());
    repository.createGenerating.mockResolvedValue(true);
    aiService.getFinanceInsights.mockResolvedValue(aiResult);

    const result = await service.refreshInsights('user-id', dto);

    expect(aiService.getFinanceInsights).toHaveBeenCalledTimes(1);
    expect(result.result).toEqual(aiResult);
  });

  it('records a stringified failure reason when the AI service rejects with a non-Error value', async () => {
    const { service, aiService, repository } = setup();
    const existing = makeSnapshot();
    repository.findForDate.mockResolvedValueOnce(existing).mockResolvedValueOnce(existing);
    repository.acquireExisting.mockResolvedValue(true);
    aiService.getFinanceInsights.mockRejectedValue('service unavailable');

    await service.refreshInsights('user-id', dto);

    expect(repository.markFailed).toHaveBeenCalledWith(existing, 'service unavailable');
  });

  it('does not duplicate generation when another refresh created the daily row', async () => {
    const { service, aiService, repository } = setup();
    const generating = makeSnapshot({
      status: AiFinanceInsightStatus.GENERATING,
      result: null,
      generatedAt: null,
    });
    repository.findForDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(generating);
    repository.createGenerating.mockResolvedValue(false);

    const result = await service.refreshInsights('user-id', dto);

    expect(result.status).toBe(AiFinanceInsightStatus.GENERATING);
    expect(result.cached).toBe(true);
    expect(aiService.getFinanceInsights).not.toHaveBeenCalled();
  });

  // WalletHealth-TC009: làm mới thủ công (POST insights/refresh) khi đã có
  // snapshot cũ và acquire thành công phải gọi lại AI Service để tính insight mới.
  it('regenerates the insight via the AI service on a successful forced refresh', async () => {
    const { service, aiService, repository } = setup();
    const existing = makeSnapshot();
    const refreshed = makeSnapshot({
      result: { ...aiResult, insight: 'Cap nhat theo giao dich moi nhat.' },
    });
    repository.findForDate
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(refreshed);
    repository.acquireExisting.mockResolvedValue(true);
    aiService.getFinanceInsights.mockResolvedValue(refreshed.result);

    const result = await service.refreshInsights('user-id', dto);

    expect(repository.acquireExisting).toHaveBeenCalledWith(existing, true);
    expect(aiService.getFinanceInsights).toHaveBeenCalledTimes(1);
    expect(repository.markCompleted).toHaveBeenCalled();
    expect(result.result).toEqual(refreshed.result);
  });

  // WalletHealth-TC002: GET insights/latest phải đọc từ bảng snapshot đã lưu,
  // không kích hoạt tạo mới/gọi AI Service.
  describe('getLatestInsights', () => {
    it('returns the mapped latest snapshot without triggering generation', async () => {
      const { service, aiService, repository } = setup();
      repository.findLatest.mockResolvedValue(makeSnapshot());

      const result = await service.getLatestInsights('user-id', dto);

      expect(repository.findLatest).toHaveBeenCalledWith('user-id', dto.month, dto.year);
      expect(result).toMatchObject({ cached: true, result: aiResult });
      expect(aiService.getFinanceInsights).not.toHaveBeenCalled();
      expect(repository.createGenerating).not.toHaveBeenCalled();
    });

    it('returns null when no snapshot exists yet for the requested month', async () => {
      const { service, repository } = setup();
      repository.findLatest.mockResolvedValue(null);

      const result = await service.getLatestInsights('user-id', dto);

      expect(result).toBeNull();
    });
  });

  // WalletHealth-TC008: khi ensureInsights không trả về result nào (ví dụ AI
  // Service lỗi và bản ghi snapshot cũng chưa có result), getInsights() phải trả
  // về nội dung dự phòng với fallback_used=true thay vì lỗi/màn hình trắng.
  describe('getInsights (fallback khi chưa có kết quả)', () => {
    it('returns the underlying snapshot result when ensureInsights succeeds', async () => {
      const { service, repository } = setup();
      repository.findForDate.mockResolvedValue(makeSnapshot());

      const result = await service.getInsights('user-id', dto);

      expect(result).toEqual(aiResult);
    });

    it('returns a fallback_used=true response when no result could be produced', async () => {
      const { service, aiService, repository } = setup();
      const generating = makeSnapshot({
        status: AiFinanceInsightStatus.GENERATING,
        result: null,
        generatedAt: null,
      });
      // findForDate resolves to the same still-generating snapshot every time —
      // simulates ensureInsights() being unable to complete generation.
      repository.findForDate.mockResolvedValue(generating);
      repository.acquireExisting.mockResolvedValue(false);

      const result = await service.getInsights('user-id', dto);

      expect(result.fallback_used).toBe(true);
      expect(result.month).toBe(dto.month);
      expect(result.year).toBe(dto.year);
      expect(aiService.getFinanceInsights).not.toHaveBeenCalled();
    });
  });
});
