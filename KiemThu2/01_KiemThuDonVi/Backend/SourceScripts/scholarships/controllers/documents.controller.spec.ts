import { HttpStatus } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const documentsService = {
    findByScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DocumentsController(documentsService as any);
  });

  it('findByScholarshipId delegates to service.findByScholarshipId', async () => {
    documentsService.findByScholarshipId.mockResolvedValue([{ id: 'doc-1' }]);

    const result = await controller.findByScholarshipId('scholarship-1');

    expect(documentsService.findByScholarshipId).toHaveBeenCalledWith('scholarship-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, data: [{ id: 'doc-1' }] });
  });

  it('findOne delegates to service.findOne with id', async () => {
    documentsService.findOne.mockResolvedValue({ id: 'doc-1' });

    const result = await controller.findOne('doc-1');

    expect(documentsService.findOne).toHaveBeenCalledWith('doc-1');
    expect(result).toMatchObject({ data: { id: 'doc-1' } });
  });

  it('create delegates to service.create with scholarshipId and dto, returns 201', async () => {
    const dto = { name: 'Bảng điểm' } as any;
    documentsService.create.mockResolvedValue({ id: 'doc-new' });

    const result = await controller.create('scholarship-1', dto);

    expect(documentsService.create).toHaveBeenCalledWith('scholarship-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('update delegates to service.update with id and dto', async () => {
    const dto = { name: 'Updated' } as any;
    documentsService.update.mockResolvedValue({ id: 'doc-1', name: 'Updated' });

    const result = await controller.update('doc-1', dto);

    expect(documentsService.update).toHaveBeenCalledWith('doc-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    documentsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('doc-1');

    expect(documentsService.remove).toHaveBeenCalledWith('doc-1');
    expect(result).toBeUndefined();
  });
});
