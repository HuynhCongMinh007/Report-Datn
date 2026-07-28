import { NotFoundException } from '@nestjs/common';
import { RequirementsService } from './requirements.service';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('RequirementsService', () => {
  let service: RequirementsService;

  const requirementsRepository = {
    findByScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequirementsService(requirementsRepository as any);
  });

  it('findByScholarshipId delegates to repository.findByScholarshipId', async () => {
    requirementsRepository.findByScholarshipId.mockResolvedValue([{ id: 'req-1' }]);

    const result = await service.findByScholarshipId('scholarship-1');

    expect(requirementsRepository.findByScholarshipId).toHaveBeenCalledWith('scholarship-1');
    expect(result).toEqual([{ id: 'req-1' }]);
  });

  describe('findOne', () => {
    it('returns the requirement when found', async () => {
      requirementsRepository.findOne.mockResolvedValue({ id: 'req-1' });

      const result = await service.findOne('req-1');

      expect(result).toEqual({ id: 'req-1' });
    });

    it('throws NotFoundException when the requirement does not exist', async () => {
      requirementsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('missing')).rejects.toThrow(SCHOLARSHIPS_CONSTANT.REQUIREMENT_NOT_FOUND);
    });
  });

  it('create delegates to repository.create with scholarshipId and dto', async () => {
    const dto = { description: 'GPA >= 3.0' } as any;
    requirementsRepository.create.mockResolvedValue({ id: 'req-new', ...dto });

    const result = await service.create('scholarship-1', dto);

    expect(requirementsRepository.create).toHaveBeenCalledWith('scholarship-1', dto);
    expect(result).toMatchObject(dto);
  });

  describe('update', () => {
    it('verifies existence before updating', async () => {
      requirementsRepository.findOne.mockResolvedValue({ id: 'req-1' });
      requirementsRepository.update.mockResolvedValue({ id: 'req-1', description: 'Updated' });

      const result = await service.update('req-1', { description: 'Updated' } as any);

      expect(requirementsRepository.update).toHaveBeenCalledWith('req-1', { description: 'Updated' });
      expect(result).toMatchObject({ description: 'Updated' });
    });

    it('throws NotFoundException and skips update when the requirement does not exist', async () => {
      requirementsRepository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(requirementsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('verifies existence before removing', async () => {
      requirementsRepository.findOne.mockResolvedValue({ id: 'req-1' });
      requirementsRepository.remove.mockResolvedValue(undefined);

      await service.remove('req-1');

      expect(requirementsRepository.remove).toHaveBeenCalledWith('req-1');
    });

    it('throws NotFoundException and skips removal when the requirement does not exist', async () => {
      requirementsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(requirementsRepository.remove).not.toHaveBeenCalled();
    });
  });
});
