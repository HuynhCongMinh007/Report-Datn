import { HttpStatus } from '@nestjs/common';
import { JarsAiController } from './jars-ai.controller';

describe('JarsAiController', () => {
  let controller: JarsAiController;

  const classifyService = {
    classify: jest.fn(),
    classifyOverride: jest.fn(),
  };
  const insightsService = {
    getInsights: jest.fn(),
    getLatestInsights: jest.fn(),
    ensureInsights: jest.fn(),
    refreshInsights: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new JarsAiController(classifyService as any, insightsService as any);
  });

  it('classify delegates to classifyService.classify and wraps the result', async () => {
    const dto = { description: 'banh mi 15k' } as any;
    classifyService.classify.mockResolvedValue({ suggestedJarCode: 'essentials' });

    const result = await controller.classify('user-1', dto);

    expect(classifyService.classify).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({
      message: 'Transaction classified successfully',
      code: HttpStatus.OK,
      data: { suggestedJarCode: 'essentials' },
    });
  });

  it('classifyOverride delegates to classifyService.classifyOverride and returns void', async () => {
    const dto = { transactionId: 'tx-1', jarCode: 'education' } as any;
    classifyService.classifyOverride.mockResolvedValue(undefined);

    const result = await controller.classifyOverride('user-1', dto);

    expect(classifyService.classifyOverride).toHaveBeenCalledWith('user-1', dto);
    expect(result).toBeUndefined();
  });

  it('insights delegates to insightsService.getInsights and wraps the result', async () => {
    const dto = { month: 7, year: 2026 } as any;
    insightsService.getInsights.mockResolvedValue({ summary: 'ok' });

    const result = await controller.insights('user-1', dto);

    expect(insightsService.getInsights).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: 'AI report insights generated successfully', data: { summary: 'ok' } });
  });

  it('latestInsights delegates to insightsService.getLatestInsights and can return null', async () => {
    const dto = { month: 7, year: 2026 } as any;
    insightsService.getLatestInsights.mockResolvedValue(null);

    const result = await controller.latestInsights('user-1', dto);

    expect(insightsService.getLatestInsights).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: 'Latest AI report insight retrieved successfully', data: null });
  });

  it('ensureInsights delegates to insightsService.ensureInsights and wraps the result', async () => {
    const dto = { month: 7, year: 2026 } as any;
    insightsService.ensureInsights.mockResolvedValue({ id: 'snapshot-1' });

    const result = await controller.ensureInsights('user-1', dto);

    expect(insightsService.ensureInsights).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: 'Daily AI report insight ensured successfully', data: { id: 'snapshot-1' } });
  });

  it('refreshInsights delegates to insightsService.refreshInsights and wraps the result', async () => {
    const dto = { month: 7, year: 2026 } as any;
    insightsService.refreshInsights.mockResolvedValue({ id: 'snapshot-2' });

    const result = await controller.refreshInsights('user-1', dto);

    expect(insightsService.refreshInsights).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: 'AI report insight refreshed successfully', data: { id: 'snapshot-2' } });
  });
});
