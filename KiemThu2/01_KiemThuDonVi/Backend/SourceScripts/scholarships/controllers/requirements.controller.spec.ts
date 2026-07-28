import { HttpStatus } from '@nestjs/common';
import { RequirementsController } from './requirements.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('RequirementsController', () => {
  let controller: RequirementsController;

  const requirementsService = {
    findByScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RequirementsController(requirementsService as any);
  });

  it('findByScholarshipId delegates to service.findByScholarshipId', async () => {
    requirementsService.findByScholarshipId.mockResolvedValue([{ id: 'req-1' }]);

    const result = await controller.findByScholarshipId('scholarship-1');

    expect(requirementsService.findByScholarshipId).toHaveBeenCalledWith('scholarship-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, data: [{ id: 'req-1' }] });
  });

  it('findOne delegates to service.findOne with id', async () => {
    requirementsService.findOne.mockResolvedValue({ id: 'req-1' });

    const result = await controller.findOne('req-1');

    expect(requirementsService.findOne).toHaveBeenCalledWith('req-1');
    expect(result).toMatchObject({ data: { id: 'req-1' } });
  });

  it('create delegates to service.create with scholarshipId and dto, returns 201', async () => {
    const dto = { description: 'GPA >= 3.0' } as any;
    requirementsService.create.mockResolvedValue({ id: 'req-new' });

    const result = await controller.create('scholarship-1', dto);

    expect(requirementsService.create).toHaveBeenCalledWith('scholarship-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('update delegates to service.update with id and dto', async () => {
    const dto = { description: 'Updated' } as any;
    requirementsService.update.mockResolvedValue({ id: 'req-1', description: 'Updated' });

    const result = await controller.update('req-1', dto);

    expect(requirementsService.update).toHaveBeenCalledWith('req-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    requirementsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('req-1');

    expect(requirementsService.remove).toHaveBeenCalledWith('req-1');
    expect(result).toBeUndefined();
  });
});
