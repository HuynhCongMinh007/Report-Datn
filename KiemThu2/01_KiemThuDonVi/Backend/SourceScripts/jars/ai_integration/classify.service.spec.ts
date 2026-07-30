import { ClassifyService } from './classify.service';

describe('ClassifyService (AI-UC02 — phân loại giao dịch bằng AI)', () => {
  let service: ClassifyService;

  const aiService = {
    classifyText: jest.fn(),
    classifyOverride: jest.fn(),
  };

  const jarsRepository = {
    findUserJarByCode: jest.fn(),
    findUserJarByIdOrCode: jest.fn(),
    findUserJarByName: jest.fn(),
    findJarTagBySlug: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jarsRepository.findUserJarByIdOrCode.mockImplementation((userId: string, code: string) =>
      jarsRepository.findUserJarByCode(userId, code),
    );
    service = new ClassifyService(aiService as any, jarsRepository as any);
  });

  it('maps the AI-suggested jar code and tag slug to the actual jar/tag records', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: 'Essentials',
      tagSlug: 'an-uong',
      tagName: 'Ăn uống',
      confidence: 0.92,
      source: 'ai',
    });
    jarsRepository.findUserJarByCode.mockResolvedValue({ id: 'jar-1' });
    jarsRepository.findJarTagBySlug.mockResolvedValue({ id: 'tag-1', slug: 'an-uong', name: 'Ăn uống' });

    const result = await service.classify('user-1', {
      description: 'Ăn trưa với bạn',
      amount: 50000,
    } as any);

    expect(jarsRepository.findUserJarByCode).toHaveBeenCalledWith('user-1', 'essentials');
    expect(result.moneyJarId).toBe('jar-1');
    expect(result.budgetId).toBe('tag-1');
    expect(result.suggested_jar_code).toBe('essentials');
    expect(result.confidence).toBe(0.92);
  });

  it('returns null jar/tag ids when the AI service could not determine a jar code', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: null,
      tagSlug: null,
      confidence: 0,
    });

    const result = await service.classify('user-1', {
      description: 'Giao dịch không rõ ràng',
      amount: 10000,
    } as any);

    expect(jarsRepository.findUserJarByCode).not.toHaveBeenCalled();
    expect(result.moneyJarId).toBeNull();
    expect(result.suggested_jar_code).toBeNull();
    expect(result.source).toBe('ai');
  });

  it('does not look up a tag when the jar code could not be mapped to a real jar', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: 'reserve',
      tagSlug: 'du-phong',
      confidence: 0.7,
    });
    jarsRepository.findUserJarByCode.mockResolvedValue(null);

    const result = await service.classify('user-1', {
      description: 'Chuyển vào quỹ dự phòng',
      amount: 200000,
    } as any);

    expect(jarsRepository.findJarTagBySlug).not.toHaveBeenCalled();
    expect(result.moneyJarId).toBeNull();
    expect(result.suggested_tag_slug).toBe('du-phong');
  });

  it('normalizes keyword and jar code to lowercase before saving an override', async () => {
    await service.classifyOverride('user-1', {
      keyword: '  Highlands Coffee  ',
      jar_code: 'ENJOYMENT',
    } as any);

    expect(aiService.classifyOverride).toHaveBeenCalledWith({
      userId: 'user-1',
      keyword: 'highlands coffee',
      jarCode: 'enjoyment',
    });
  });

  it('falls back to the AI-suggested tag slug/name when no matching tag exists locally yet', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: 'essentials',
      tagSlug: 'an-uong',
      tagName: 'Ăn uống',
      confidence: 0.6,
    });
    jarsRepository.findUserJarByCode.mockResolvedValue({ id: 'jar-1' });
    jarsRepository.findJarTagBySlug.mockResolvedValue(null);

    const result = await service.classify('user-1', {
      description: 'Bún chả 35k',
      amount: 35000,
    } as any);

    expect(result.budgetId).toBeNull();
    expect(result.suggested_tag_slug).toBe('an-uong');
    expect(result.suggested_tag_name).toBe('Ăn uống');
  });

  it('defaults source to "ai" when the proxy response omits it', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: 'essentials',
      confidence: 0.8,
    });
    jarsRepository.findUserJarByCode.mockResolvedValue({ id: 'jar-1' });

    const result = await service.classify('user-1', {
      description: 'Ăn sáng',
      amount: 20000,
    } as any);

    expect(result.source).toBe('ai');
  });

  it('preserves an explicit non-AI source such as a saved keyword override', async () => {
    aiService.classifyText.mockResolvedValue({
      jarCode: 'essentials',
      confidence: 1,
      source: 'override',
    });
    jarsRepository.findUserJarByCode.mockResolvedValue({ id: 'jar-1' });

    const result = await service.classify('user-1', {
      description: 'Highlands Coffee',
      amount: 45000,
    } as any);

    expect(result.source).toBe('override');
  });
});
