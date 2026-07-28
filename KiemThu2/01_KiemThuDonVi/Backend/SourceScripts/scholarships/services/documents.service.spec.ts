import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const documentsRepository = {
    findByScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentsService(documentsRepository as any);
  });

  it('findByScholarshipId delegates to repository.findByScholarshipId', async () => {
    documentsRepository.findByScholarshipId.mockResolvedValue([{ id: 'doc-1' }]);

    const result = await service.findByScholarshipId('scholarship-1');

    expect(documentsRepository.findByScholarshipId).toHaveBeenCalledWith('scholarship-1');
    expect(result).toEqual([{ id: 'doc-1' }]);
  });

  describe('findOne', () => {
    it('returns the document when found', async () => {
      documentsRepository.findOne.mockResolvedValue({ id: 'doc-1' });

      const result = await service.findOne('doc-1');

      expect(result).toEqual({ id: 'doc-1' });
    });

    it('throws NotFoundException when the document does not exist', async () => {
      documentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('missing')).rejects.toThrow(SCHOLARSHIPS_CONSTANT.DOCUMENT_NOT_FOUND);
    });
  });

  it('create delegates to repository.create with scholarshipId and dto', async () => {
    const dto = { name: 'Bảng điểm' } as any;
    documentsRepository.create.mockResolvedValue({ id: 'doc-new', ...dto });

    const result = await service.create('scholarship-1', dto);

    expect(documentsRepository.create).toHaveBeenCalledWith('scholarship-1', dto);
    expect(result).toMatchObject(dto);
  });

  describe('update', () => {
    it('verifies existence before updating', async () => {
      documentsRepository.findOne.mockResolvedValue({ id: 'doc-1' });
      documentsRepository.update.mockResolvedValue({ id: 'doc-1', name: 'Updated' });

      const result = await service.update('doc-1', { name: 'Updated' } as any);

      expect(documentsRepository.update).toHaveBeenCalledWith('doc-1', { name: 'Updated' });
      expect(result).toMatchObject({ name: 'Updated' });
    });

    it('throws NotFoundException and skips update when the document does not exist', async () => {
      documentsRepository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(documentsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('verifies existence before removing', async () => {
      documentsRepository.findOne.mockResolvedValue({ id: 'doc-1' });
      documentsRepository.remove.mockResolvedValue(undefined);

      await service.remove('doc-1');

      expect(documentsRepository.remove).toHaveBeenCalledWith('doc-1');
    });

    it('throws NotFoundException and skips removal when the document does not exist', async () => {
      documentsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(documentsRepository.remove).not.toHaveBeenCalled();
    });
  });
});
