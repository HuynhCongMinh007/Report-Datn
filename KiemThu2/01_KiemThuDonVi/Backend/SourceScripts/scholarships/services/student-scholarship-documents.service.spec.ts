import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudentScholarshipDocumentsService } from './student-scholarship-documents.service';
import { StudentScholarshipStatus } from '@/database/entities';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('StudentScholarshipDocumentsService', () => {
  let service: StudentScholarshipDocumentsService;

  const repository = {
    findByStudentScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };
  const studentScholarshipsService = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StudentScholarshipDocumentsService(repository as any, studentScholarshipsService as any);
  });

  it('findByStudentScholarshipId delegates to the repository', async () => {
    repository.findByStudentScholarshipId.mockResolvedValue([{ id: 'doc-1' }]);

    const result = await service.findByStudentScholarshipId('app-1');

    expect(repository.findByStudentScholarshipId).toHaveBeenCalledWith('app-1');
    expect(result).toEqual([{ id: 'doc-1' }]);
  });

  describe('findOne', () => {
    it('returns the document when found', async () => {
      repository.findOne.mockResolvedValue({ id: 'doc-1' });

      const result = await service.findOne('doc-1');

      expect(result).toEqual({ id: 'doc-1' });
    });

    it('throws NotFoundException when the document does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('missing')).rejects.toThrow(SCHOLARSHIPS_CONSTANT.DOCUMENT_NOT_FOUND);
    });
  });

  describe('create (immutability check)', () => {
    it.each([StudentScholarshipStatus.DRAFT, StudentScholarshipStatus.NEED_MODIFICATION])(
      'allows document creation when the application status is %s',
      async (status) => {
        studentScholarshipsService.findOne.mockResolvedValue({ status });
        repository.create.mockResolvedValue({ id: 'doc-new' });

        const result = await service.create('app-1', { fileUrl: 'x' } as any);

        expect(repository.create).toHaveBeenCalledWith('app-1', { fileUrl: 'x' });
        expect(result).toEqual({ id: 'doc-new' });
      },
    );

    it.each([
      StudentScholarshipStatus.SUBMITTED,
      StudentScholarshipStatus.UNDER_REVIEW,
      StudentScholarshipStatus.APPROVED,
      StudentScholarshipStatus.REJECTED,
    ])('rejects document creation once the application status is %s (read-only)', async (status) => {
      studentScholarshipsService.findOne.mockResolvedValue({ status });

      await expect(service.create('app-1', {} as any)).rejects.toThrow(ForbiddenException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('verifies the document exists before updating its status', async () => {
      repository.findOne.mockResolvedValue({ id: 'doc-1' });
      repository.updateStatus.mockResolvedValue({ id: 'doc-1', status: 'APPROVED' });

      const result = await service.updateStatus('doc-1', {
        status: 'APPROVED',
        reviewer_note: 'ok',
      } as any);

      expect(repository.updateStatus).toHaveBeenCalledWith('doc-1', 'APPROVED', 'ok');
      expect(result).toMatchObject({ status: 'APPROVED' });
    });

    it('throws NotFoundException when the document does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.updateStatus('missing', {} as any)).rejects.toThrow(NotFoundException);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('remove (immutability check)', () => {
    it('removes the document when the parent application is still mutable', async () => {
      repository.findOne.mockResolvedValue({ id: 'doc-1', studentScholarshipId: 'app-1' });
      studentScholarshipsService.findOne.mockResolvedValue({ status: StudentScholarshipStatus.DRAFT });
      repository.remove.mockResolvedValue(undefined);

      await service.remove('doc-1');

      expect(repository.remove).toHaveBeenCalledWith('doc-1');
    });

    it('throws ForbiddenException and skips removal once the application is submitted', async () => {
      repository.findOne.mockResolvedValue({ id: 'doc-1', studentScholarshipId: 'app-1' });
      studentScholarshipsService.findOne.mockResolvedValue({ status: StudentScholarshipStatus.SUBMITTED });

      await expect(service.remove('doc-1')).rejects.toThrow(ForbiddenException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the document itself does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
