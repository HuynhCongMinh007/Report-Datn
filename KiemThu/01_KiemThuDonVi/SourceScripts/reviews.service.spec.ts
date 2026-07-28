import { NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

describe('ReviewsService (SCH-UC03 — xét duyệt hồ sơ học bổng, ghi nhận đánh giá)', () => {
  let service: ReviewsService;

  const reviewsRepository = {
    findByStudentScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewsService(reviewsRepository as any);
  });

  it('lists all reviews recorded for a student scholarship application', async () => {
    reviewsRepository.findByStudentScholarshipId.mockResolvedValue([
      { id: 'review-1', status: 'approved' },
    ]);

    const result = await service.findByStudentScholarshipId('app-1');

    expect(result).toHaveLength(1);
    expect(reviewsRepository.findByStudentScholarshipId).toHaveBeenCalledWith('app-1');
  });

  it('throws NotFoundException when the requested review does not exist', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('review-missing')).rejects.toThrow(NotFoundException);
  });

  it('creates a reviewer decision for a student scholarship application', async () => {
    reviewsRepository.create.mockResolvedValue({ id: 'review-1', status: 'approved' });

    const result = await service.create('app-1', 'reviewer-1', {
      status: 'approved',
      comment: 'Hồ sơ xuất sắc',
    } as any);

    expect(reviewsRepository.create).toHaveBeenCalledWith('app-1', 'reviewer-1', {
      status: 'approved',
      comment: 'Hồ sơ xuất sắc',
    });
    expect(result.status).toBe('approved');
  });

  it('rejects updating a review that does not exist', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.update('review-missing', { status: 'rejected' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(reviewsRepository.update).not.toHaveBeenCalled();
  });

  it('updates an existing review', async () => {
    reviewsRepository.findOne.mockResolvedValue({ id: 'review-1', status: 'pending' });
    reviewsRepository.update.mockResolvedValue({ id: 'review-1', status: 'approved' });

    const result = await service.update('review-1', { status: 'approved' } as any);

    expect(result.status).toBe('approved');
  });

  it('rejects removing a review that does not exist', async () => {
    reviewsRepository.findOne.mockResolvedValue(null);

    await expect(service.remove('review-missing')).rejects.toThrow(NotFoundException);
    expect(reviewsRepository.remove).not.toHaveBeenCalled();
  });
});
