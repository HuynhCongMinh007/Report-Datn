import { HttpStatus } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  const categoriesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CategoriesController(categoriesService as any);
  });

  it('findAll delegates to service.findAll', async () => {
    categoriesService.findAll.mockResolvedValue([{ id: 'cat-1' }]);

    const result = await controller.findAll();

    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, code: HttpStatus.OK, data: [{ id: 'cat-1' }] });
  });

  it('findOne delegates to service.findOne with id', async () => {
    categoriesService.findOne.mockResolvedValue({ id: 'cat-1' });

    const result = await controller.findOne('cat-1');

    expect(categoriesService.findOne).toHaveBeenCalledWith('cat-1');
    expect(result).toMatchObject({ data: { id: 'cat-1' } });
  });

  it('create delegates to service.create and returns 201', async () => {
    const dto = { name: 'STEM' } as any;
    categoriesService.create.mockResolvedValue({ id: 'cat-new' });

    const result = await controller.create(dto);

    expect(categoriesService.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('update delegates to service.update with id and dto', async () => {
    const dto = { name: 'Updated' } as any;
    categoriesService.update.mockResolvedValue({ id: 'cat-1', name: 'Updated' });

    const result = await controller.update('cat-1', dto);

    expect(categoriesService.update).toHaveBeenCalledWith('cat-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    categoriesService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('cat-1');

    expect(categoriesService.remove).toHaveBeenCalledWith('cat-1');
    expect(result).toBeUndefined();
  });
});
