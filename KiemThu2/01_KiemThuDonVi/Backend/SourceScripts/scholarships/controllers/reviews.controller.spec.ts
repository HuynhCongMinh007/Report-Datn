import { HttpStatus } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const reviewsService = {
    findByStudentScholarshipId: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ReviewsController(reviewsService as any);
  });

  it('findByStudentScholarshipId delegates to service.findByStudentScholarshipId', async () => {
    reviewsService.findByStudentScholarshipId.mockResolvedValue([{ id: 'review-1' }]);

    const result = await controller.findByStudentScholarshipId('app-1');

    expect(reviewsService.findByStudentScholarshipId).toHaveBeenCalledWith('app-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, data: [{ id: 'review-1' }] });
  });

  it('findOne delegates to service.findOne with id', async () => {
    reviewsService.findOne.mockResolvedValue({ id: 'review-1' });

    const result = await controller.findOne('review-1');

    expect(reviewsService.findOne).toHaveBeenCalledWith('review-1');
    expect(result).toMatchObject({ data: { id: 'review-1' } });
  });

  it('create delegates to service.create with studentScholarshipId, current userId, and dto', async () => {
    const dto = { comment: 'Đạt yêu cầu' } as any;
    reviewsService.create.mockResolvedValue({ id: 'review-new' });

    const result = await controller.create('app-1', dto, { userId: 'reviewer-1' } as any);

    expect(reviewsService.create).toHaveBeenCalledWith('app-1', 'reviewer-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('update delegates to service.update with id and partial dto', async () => {
    const dto = { comment: 'Updated' } as any;
    reviewsService.update.mockResolvedValue({ id: 'review-1', comment: 'Updated' });

    const result = await controller.update('review-1', dto);

    expect(reviewsService.update).toHaveBeenCalledWith('review-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    reviewsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('review-1');

    expect(reviewsService.remove).toHaveBeenCalledWith('review-1');
    expect(result).toBeUndefined();
  });
});
