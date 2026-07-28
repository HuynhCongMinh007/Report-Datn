import { HttpStatus } from '@nestjs/common';
import { StudentScholarshipDocumentsController } from './student-scholarship-documents.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('StudentScholarshipDocumentsController', () => {
  let controller: StudentScholarshipDocumentsController;

  const studentScholarshipDocumentsService = {
    findByStudentScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StudentScholarshipDocumentsController(studentScholarshipDocumentsService as any);
  });

  it('findByStudentScholarshipId delegates to service.findByStudentScholarshipId', async () => {
    studentScholarshipDocumentsService.findByStudentScholarshipId.mockResolvedValue([{ id: 'doc-1' }]);

    const result = await controller.findByStudentScholarshipId('app-1');

    expect(studentScholarshipDocumentsService.findByStudentScholarshipId).toHaveBeenCalledWith('app-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, data: [{ id: 'doc-1' }] });
  });

  it('findOne delegates to service.findOne with id', async () => {
    studentScholarshipDocumentsService.findOne.mockResolvedValue({ id: 'doc-1' });

    const result = await controller.findOne('doc-1');

    expect(studentScholarshipDocumentsService.findOne).toHaveBeenCalledWith('doc-1');
    expect(result).toMatchObject({ data: { id: 'doc-1' } });
  });

  it('create delegates to service.create with studentScholarshipId and dto, returns 201', async () => {
    const dto = { fileUrl: 'https://example.com/doc.pdf' } as any;
    studentScholarshipDocumentsService.create.mockResolvedValue({ id: 'doc-new' });

    const result = await controller.create('app-1', dto);

    expect(studentScholarshipDocumentsService.create).toHaveBeenCalledWith('app-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('updateStatus delegates to service.updateStatus with id and dto', async () => {
    const dto = { status: 'APPROVED' } as any;
    studentScholarshipDocumentsService.updateStatus.mockResolvedValue({ id: 'doc-1', status: 'APPROVED' });

    const result = await controller.updateStatus('doc-1', dto);

    expect(studentScholarshipDocumentsService.updateStatus).toHaveBeenCalledWith('doc-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    studentScholarshipDocumentsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('doc-1');

    expect(studentScholarshipDocumentsService.remove).toHaveBeenCalledWith('doc-1');
    expect(result).toBeUndefined();
  });
});
