import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const categoriesRepository = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CategoriesService(categoriesRepository as any);
  });

  it('findAll delegates to repository.findAll', async () => {
    categoriesRepository.findAll.mockResolvedValue([{ id: 'cat-1' }]);

    const result = await service.findAll();

    expect(result).toEqual([{ id: 'cat-1' }]);
  });

  describe('findOne', () => {
    it('returns the category when found', async () => {
      categoriesRepository.findOne.mockResolvedValue({ id: 'cat-1' });

      const result = await service.findOne('cat-1');

      expect(result).toEqual({ id: 'cat-1' });
    });

    it('throws NotFoundException when the category does not exist', async () => {
      categoriesRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('missing')).rejects.toThrow(SCHOLARSHIPS_CONSTANT.CATEGORY_NOT_FOUND);
    });
  });

  it('create delegates to repository.create with the dto', async () => {
    const dto = { name: 'STEM' } as any;
    categoriesRepository.create.mockResolvedValue({ id: 'cat-new', ...dto });

    const result = await service.create(dto);

    expect(categoriesRepository.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject(dto);
  });

  describe('update', () => {
    it('verifies existence before updating', async () => {
      categoriesRepository.findOne.mockResolvedValue({ id: 'cat-1' });
      categoriesRepository.update.mockResolvedValue({ id: 'cat-1', name: 'Updated' });

      const result = await service.update('cat-1', { name: 'Updated' } as any);

      expect(categoriesRepository.update).toHaveBeenCalledWith('cat-1', { name: 'Updated' });
      expect(result).toMatchObject({ name: 'Updated' });
    });

    it('throws NotFoundException and skips update when the category does not exist', async () => {
      categoriesRepository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(categoriesRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('verifies existence before removing', async () => {
      categoriesRepository.findOne.mockResolvedValue({ id: 'cat-1' });
      categoriesRepository.remove.mockResolvedValue(undefined);

      await service.remove('cat-1');

      expect(categoriesRepository.remove).toHaveBeenCalledWith('cat-1');
    });

    it('throws NotFoundException and skips removal when the category does not exist', async () => {
      categoriesRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(categoriesRepository.remove).not.toHaveBeenCalled();
    });
  });
});
