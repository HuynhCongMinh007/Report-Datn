import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError } from 'axios';
import { AiServiceClientService } from './ai-service-client.service';

describe('AiServiceClientService', () => {
  let service: AiServiceClientService;

  const mockHttpService = {
    axiosRef: {
      get: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal: unknown) => {
      if (key === 'app.aiMatching.baseUrl') return 'http://localhost:9091';
      if (key === 'app.aiMatching.timeout') return 5000;
      return defaultVal;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiServiceClientService(
      mockHttpService as any,
      mockConfigService as any,
    );
  });

  describe('getHealth', () => {
    it('should return health data when AI service responds', async () => {
      const healthData = { status: 'ok', qdrant: 'ok', neo4j: 'ok' };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: healthData });

      const result = await service.getHealth();

      expect(result).toEqual(healthData);
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'http://localhost:9091/health',
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('should throw ServiceUnavailableException when AI service is down', async () => {
      const error = new Error('ECONNREFUSED') as AxiosError;
      mockHttpService.axiosRef.get.mockRejectedValue(error);

      await expect(service.getHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getSkillStats', () => {
    it('should return skill stats from AI service', async () => {
      const stats = {
        taxonomy_count: 500,
        neo4j_skill_count: 480,
        qdrant_jobs_count: 100,
      };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: stats });

      const result = await service.getSkillStats();

      expect(result).toEqual(stats);
    });
  });

  describe('getSkill', () => {
    it('should return skill detail by id', async () => {
      const skill = { id: 'python', name: 'Python', category: 'programming' };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: skill });

      const result = await service.getSkill('python');

      expect(result).toEqual(skill);
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'http://localhost:9091/skills/python',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when AI service returns 404', async () => {
      const error = { response: { status: 404 }, message: 'Not Found' } as AxiosError;
      mockHttpService.axiosRef.get.mockRejectedValue(error);

      await expect(service.getSkill('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSkillRelationships', () => {
    it('should return relationships for a skill', async () => {
      const rels = [{ from: 'python', to: 'django', type: 'related' }];
      mockHttpService.axiosRef.get.mockResolvedValue({ data: rels });

      const result = await service.getSkillRelationships('python');

      expect(result).toEqual(rels);
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'http://localhost:9091/skills/python/relationships',
        expect.any(Object),
      );
    });
  });

  describe('listSkills', () => {
    it('should pass query params to AI service', async () => {
      const skillList = { items: [], total: 0 };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: skillList });

      await service.listSkills({ query: 'react', page: 1, limit: 10 });

      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'http://localhost:9091/skills',
        expect.objectContaining({
          params: { query: 'react', page: 1, limit: 10 },
        }),
      );
    });

    it('should default to an empty query object when none is provided', async () => {
      const skillList = { items: [], total: 0 };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: skillList });

      await service.listSkills();

      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'http://localhost:9091/skills',
        expect.objectContaining({ params: {} }),
      );
    });
  });

  describe('handleError', () => {
    it('falls back to "unknown error" when the rejected value has no message', async () => {
      mockHttpService.axiosRef.get.mockRejectedValue({});

      await expect(service.getHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('runDataHealth', () => {
    it('should return data health from AI service', async () => {
      const health = { status: 'ok', stores: {} };
      mockHttpService.axiosRef.get.mockResolvedValue({ data: health });

      const result = await service.runDataHealth();

      expect(result).toEqual(health);
    });

    it('should throw ServiceUnavailableException on network error', async () => {
      mockHttpService.axiosRef.get.mockRejectedValue(new Error('timeout'));

      await expect(service.runDataHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
