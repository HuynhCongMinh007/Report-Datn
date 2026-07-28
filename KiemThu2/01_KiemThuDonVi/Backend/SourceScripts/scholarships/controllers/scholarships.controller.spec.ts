import { HttpStatus } from '@nestjs/common';
import { ScholarshipsController } from './scholarships.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('ScholarshipsController', () => {
  let controller: ScholarshipsController;

  const scholarshipsService = {
    findAll: jest.fn(),
    getOrganizationSummary: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const studentScholarshipsService = {
    registerScholarship: jest.fn(),
    getUserScholarships: jest.fn(),
    getUserScholarshipDetail: jest.fn(),
    confirmAward: jest.fn(),
    unregisterScholarship: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ScholarshipsController(scholarshipsService as any, studentScholarshipsService as any);
  });

  describe('findAll', () => {
    it('defaults page to 1 and limit to 20 when not provided', async () => {
      scholarshipsService.findAll.mockResolvedValue({ items: [], total: 0 });

      await controller.findAll();

      expect(scholarshipsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('parses page/limit query strings into numbers and forwards all filters', async () => {
      scholarshipsService.findAll.mockResolvedValue({ items: [{ id: 's-1' }], total: 1 });

      const result = await controller.findAll(
        'cat-1',
        'provider-1',
        'ProviderName',
        'true',
        'true',
        'true',
        'stem',
        'CS',
        'HCMUS',
        '1000000',
        '10',
        '2',
      );

      expect(scholarshipsService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        category_id: 'cat-1',
        provider_id: 'provider-1',
        provider: 'ProviderName',
        active: 'true',
        open_application: 'true',
        high_amount: 'true',
        search: 'stem',
        major: 'CS',
        university: 'HCMUS',
        min_value: '1000000',
      });
      expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK, data: [{ id: 's-1' }] });
    });
  });

  describe('findByOrganization', () => {
    it('scopes findAll to the given provider_id with default pagination', async () => {
      scholarshipsService.findAll.mockResolvedValue({ items: [], total: 0 });

      await controller.findByOrganization('org-1');

      expect(scholarshipsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        provider_id: 'org-1',
      });
    });
  });

  it('getOrganizationSummary delegates to service.getOrganizationSummary', async () => {
    scholarshipsService.getOrganizationSummary.mockResolvedValue({ total: 5 });

    const result = await controller.getOrganizationSummary('org-1');

    expect(scholarshipsService.getOrganizationSummary).toHaveBeenCalledWith('org-1');
    expect(result).toMatchObject({ data: { total: 5 } });
  });

  it('registerScholarship delegates to studentScholarshipsService.registerScholarship and returns 201', async () => {
    const dto = { scholarshipId: 'scholarship-1' } as any;
    studentScholarshipsService.registerScholarship.mockResolvedValue({ id: 'app-1' });

    const result = await controller.registerScholarship(dto, 'user-1');

    expect(studentScholarshipsService.registerScholarship).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('getUserScholarships delegates to studentScholarshipsService.getUserScholarships with meta', async () => {
    const meta = { total: 1 };
    studentScholarshipsService.getUserScholarships.mockResolvedValue({ data: [{ id: 'app-1' }], meta });
    const dto = { page: 1 } as any;

    const result = await controller.getUserScholarships(dto, 'user-1');

    expect(studentScholarshipsService.getUserScholarships).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ data: [{ id: 'app-1' }], meta });
  });

  it('getUserScholarshipDetail delegates to studentScholarshipsService.getUserScholarshipDetail', async () => {
    studentScholarshipsService.getUserScholarshipDetail.mockResolvedValue({ id: 'app-1' });

    const result = await controller.getUserScholarshipDetail({ id: 'app-1' } as any, 'user-1');

    expect(studentScholarshipsService.getUserScholarshipDetail).toHaveBeenCalledWith('user-1', 'app-1');
    expect(result).toMatchObject({ data: { id: 'app-1' } });
  });

  it('confirmScholarship delegates to studentScholarshipsService.confirmAward with termsAccepted', async () => {
    studentScholarshipsService.confirmAward.mockResolvedValue({ id: 'app-1', status: 'CONFIRMED' });

    const result = await controller.confirmScholarship('app-1', 'user-1', true);

    expect(studentScholarshipsService.confirmAward).toHaveBeenCalledWith('app-1', 'user-1', true);
    expect(result).toMatchObject({ data: { id: 'app-1', status: 'CONFIRMED' } });
  });

  it('unregisterScholarship delegates to studentScholarshipsService.unregisterScholarship', async () => {
    studentScholarshipsService.unregisterScholarship.mockResolvedValue(undefined);

    const result = await controller.unregisterScholarship({ id: 'app-1' } as any, 'user-1');

    expect(studentScholarshipsService.unregisterScholarship).toHaveBeenCalledWith('user-1', 'app-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('updateApplicationStatus delegates to studentScholarshipsService.updateStatus', async () => {
    const dto = { status: 'APPROVED' } as any;
    studentScholarshipsService.updateStatus.mockResolvedValue({ id: 'app-1', status: 'APPROVED' });

    const result = await controller.updateApplicationStatus('app-1', dto);

    expect(studentScholarshipsService.updateStatus).toHaveBeenCalledWith('app-1', dto);
    expect(result).toMatchObject({ data: { status: 'APPROVED' } });
  });

  it('findOne delegates to service.findOne with id', async () => {
    scholarshipsService.findOne.mockResolvedValue({ id: 'scholarship-1' });

    const result = await controller.findOne('scholarship-1');

    expect(scholarshipsService.findOne).toHaveBeenCalledWith('scholarship-1');
    expect(result).toMatchObject({ data: { id: 'scholarship-1' } });
  });

  it('create delegates to service.create and returns 201', async () => {
    const dto = { name: 'Học bổng khuyến khích' } as any;
    scholarshipsService.create.mockResolvedValue({ id: 'scholarship-new' });

    const result = await controller.create(dto);

    expect(scholarshipsService.create).toHaveBeenCalledWith(dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED, code: HttpStatus.CREATED });
  });

  it('update delegates to service.update with id and dto', async () => {
    const dto = { name: 'Updated' } as any;
    scholarshipsService.update.mockResolvedValue({ id: 'scholarship-1', name: 'Updated' });

    const result = await controller.update('scholarship-1', dto);

    expect(scholarshipsService.update).toHaveBeenCalledWith('scholarship-1', dto);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('remove delegates to service.remove with id and returns nothing', async () => {
    scholarshipsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('scholarship-1');

    expect(scholarshipsService.remove).toHaveBeenCalledWith('scholarship-1');
    expect(result).toBeUndefined();
  });
});
