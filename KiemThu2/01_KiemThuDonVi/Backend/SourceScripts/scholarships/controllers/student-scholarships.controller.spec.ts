import { StudentScholarshipsController } from './student-scholarships.controller';
import { SCHOLARSHIPS_CONSTANT } from '../constants/scholarships.constant';

describe('StudentScholarshipsController', () => {
  let controller: StudentScholarshipsController;

  const studentScholarshipsService = {
    findAll: jest.fn(),
    findByOrganization: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    submit: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StudentScholarshipsController(studentScholarshipsService as any);
  });

  describe('findAll', () => {
    it('defaults page/limit and forwards optional filters', async () => {
      studentScholarshipsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll('user-1', 'scholarship-1');

      expect(studentScholarshipsService.findAll).toHaveBeenCalledWith('user-1', 'scholarship-1', 1, 20);
    });

    it('parses page/limit query strings into numbers', async () => {
      studentScholarshipsService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll(undefined, undefined, '3', '5');

      expect(studentScholarshipsService.findAll).toHaveBeenCalledWith(undefined, undefined, 3, 5);
    });
  });

  it('findMyApplications scopes findAll to the current user with default pagination', async () => {
    studentScholarshipsService.findAll.mockResolvedValue({ data: [{ id: 'app-1' }], meta: {} });

    const result = await controller.findMyApplications({ userId: 'user-1' } as any);

    expect(studentScholarshipsService.findAll).toHaveBeenCalledWith('user-1', undefined, 1, 20);
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('findByOrganization delegates to service.findByOrganization with parsed pagination', async () => {
    studentScholarshipsService.findByOrganization.mockResolvedValue({ data: [], meta: {} });

    await controller.findByOrganization('org-1', '2', '10');

    expect(studentScholarshipsService.findByOrganization).toHaveBeenCalledWith('org-1', 2, 10);
  });

  it('findOne passes the current user id through to service.findOne', async () => {
    studentScholarshipsService.findOne.mockResolvedValue({ id: 'app-1' });

    const result = await controller.findOne('app-1', { userId: 'user-1' } as any);

    expect(studentScholarshipsService.findOne).toHaveBeenCalledWith('app-1', 'user-1');
    expect(result).toMatchObject({ data: { id: 'app-1' } });
  });

  it('findOne tolerates a missing current user (public-ish lookup) by passing undefined userId', async () => {
    studentScholarshipsService.findOne.mockResolvedValue({ id: 'app-1' });

    await controller.findOne('app-1', undefined as any);

    expect(studentScholarshipsService.findOne).toHaveBeenCalledWith('app-1', undefined);
  });

  it('create delegates to service.create with dto and current userId', async () => {
    const dto = { scholarshipId: 'scholarship-1' } as any;
    studentScholarshipsService.create.mockResolvedValue({ id: 'app-new' });

    const result = await controller.create(dto, { userId: 'user-1' } as any);

    expect(studentScholarshipsService.create).toHaveBeenCalledWith(dto, 'user-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.CREATED });
  });

  it('update delegates to service.update with id, dto and current userId', async () => {
    const dto = { gpa: 3.5 } as any;
    studentScholarshipsService.update.mockResolvedValue({ id: 'app-1', gpa: 3.5 });

    const result = await controller.update('app-1', dto, { userId: 'user-1' } as any);

    expect(studentScholarshipsService.update).toHaveBeenCalledWith('app-1', dto, 'user-1');
    expect(result).toMatchObject({ message: SCHOLARSHIPS_CONSTANT.OK });
  });

  it('submit delegates to service.submit with id, dto and current userId', async () => {
    const dto = { confirm: true } as any;
    studentScholarshipsService.submit.mockResolvedValue({ id: 'app-1', status: 'SUBMITTED' });

    const result = await controller.submit('app-1', dto, { userId: 'user-1' } as any);

    expect(studentScholarshipsService.submit).toHaveBeenCalledWith('app-1', dto, 'user-1');
    expect(result).toMatchObject({ data: { status: 'SUBMITTED' } });
  });

  it('updateStatus delegates to service.updateStatus with id and dto', async () => {
    const dto = { status: 'APPROVED' } as any;
    studentScholarshipsService.updateStatus.mockResolvedValue({ id: 'app-1', status: 'APPROVED' });

    const result = await controller.updateStatus('app-1', dto);

    expect(studentScholarshipsService.updateStatus).toHaveBeenCalledWith('app-1', dto);
    expect(result).toMatchObject({ data: { status: 'APPROVED' } });
  });

  it('remove delegates to service.remove using user.id (not user.userId)', async () => {
    studentScholarshipsService.remove.mockResolvedValue(undefined);

    await controller.remove('app-1', { id: 'user-1' } as any);

    expect(studentScholarshipsService.remove).toHaveBeenCalledWith('app-1', 'user-1');
  });
});
