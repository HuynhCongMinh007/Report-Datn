import { ReviewsRepository } from './reviews.repository';

describe('ReviewsRepository', () => {
  let repository: ReviewsRepository;

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
    repository = new ReviewsRepository(repo as any);
  });

  describe('create', () => {
    it('defaults reviewedAt to now when the dto does not provide one', async () => {
      repo.create.mockImplementation((entity) => entity);
      repo.save.mockImplementation((entity) => Promise.resolve({ id: 'review-1', ...entity }));

      const before = Date.now();
      await repository.create('app-1', 'reviewer-1', { stage: 'ACADEMIC', status: 'PASSED', comment: 'ok' } as any);
      const after = Date.now();

      const savedEntity = repo.create.mock.calls[0][0];
      expect(savedEntity.reviewedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(savedEntity.reviewedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('parses the provided reviewedAt string into a Date', async () => {
      repo.create.mockImplementation((entity) => entity);
      repo.save.mockImplementation((entity) => Promise.resolve(entity));

      await repository.create('app-1', 'reviewer-1', {
        stage: 'ACADEMIC',
        status: 'PASSED',
        reviewedAt: '2026-07-01T00:00:00.000Z',
      } as any);

      const savedEntity = repo.create.mock.calls[0][0];
      expect(savedEntity.reviewedAt).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    });
  });

  describe('update', () => {
    it('only includes fields that are explicitly provided in the partial dto', async () => {
      repo.update.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ id: 'review-1', comment: 'Updated' });

      await repository.update('review-1', { comment: 'Updated' });

      expect(repo.update).toHaveBeenCalledWith('review-1', { comment: 'Updated' });
    });

    it('parses reviewedAt when provided and omits it when absent', async () => {
      repo.update.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ id: 'review-1' });

      await repository.update('review-1', { reviewedAt: '2026-07-02T00:00:00.000Z' } as any);

      expect(repo.update).toHaveBeenCalledWith('review-1', { reviewedAt: new Date('2026-07-02T00:00:00.000Z') });
    });

    it('sends an empty update payload when the dto has no fields set', async () => {
      repo.update.mockResolvedValue(undefined);
      repo.findOne.mockResolvedValue({ id: 'review-1' });

      await repository.update('review-1', {});

      expect(repo.update).toHaveBeenCalledWith('review-1', {});
    });
  });
});
