import { StudentScholarshipDocumentsRepository } from './student-scholarship-documents.repository';
import { DocumentStatus } from '@/database/entities';

describe('StudentScholarshipDocumentsRepository', () => {
  let repository: StudentScholarshipDocumentsRepository;

  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new StudentScholarshipDocumentsRepository(repo as any);
  });

  describe('create', () => {
    it('defaults status to PENDING and sets uploadDate to now', async () => {
      repo.create.mockImplementation((entity) => entity);
      repo.save.mockImplementation((entity) => Promise.resolve({ id: 'doc-1', ...entity }));

      const before = Date.now();
      await repository.create('app-1', { documentId: 'doc-type-1', fileUrl: 'https://x/y.pdf' } as any);
      const after = Date.now();

      const savedEntity = repo.create.mock.calls[0][0];
      expect(savedEntity.status).toBe(DocumentStatus.PENDING);
      expect(savedEntity.uploadDate.getTime()).toBeGreaterThanOrEqual(before);
      expect(savedEntity.uploadDate.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('updateStatus', () => {
    it('updates status and reviewerNote, then re-fetches the document', async () => {
      repo.update.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ id: 'doc-1', status: DocumentStatus.APPROVED });

      const result = await repository.updateStatus('doc-1', DocumentStatus.APPROVED, 'Đạt yêu cầu');

      expect(repo.update).toHaveBeenCalledWith('doc-1', {
        status: DocumentStatus.APPROVED,
        reviewerNote: 'Đạt yêu cầu',
      });
      expect(result).toMatchObject({ status: DocumentStatus.APPROVED });
    });

    it('allows an undefined reviewerNote', async () => {
      repo.update.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ id: 'doc-1' });

      await repository.updateStatus('doc-1', DocumentStatus.REJECTED);

      expect(repo.update).toHaveBeenCalledWith('doc-1', {
        status: DocumentStatus.REJECTED,
        reviewerNote: undefined,
      });
    });
  });
});
