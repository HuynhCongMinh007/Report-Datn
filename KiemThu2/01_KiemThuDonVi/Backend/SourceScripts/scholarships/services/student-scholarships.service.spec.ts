import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudentScholarshipsService } from './student-scholarships.service';
import {
  UserProfile,
  StudentAcademicProfile,
  StudentScholarship,
  StudentScholarshipStatus,
  StudentScholarshipDocument,
  StudentScholarshipHistory,
} from '@/database/entities';

describe('StudentScholarshipsService', () => {
  let service: StudentScholarshipsService;

  const studentScholarshipsRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    submit: jest.fn(),
    updateStatus: jest.fn(),
    findByIdWithUserAndAccount: jest.fn(),
    remove: jest.fn(),
    findAll: jest.fn(),
    findByOrganization: jest.fn(),
    cancelApplication: jest.fn(),
  };

  const scholarshipsRepository = { findOne: jest.fn() };
  const profileRepository = {};
  const studentScholarshipDocumentsRepository = {};

  const manager = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((_entity: any, data: any) => data),
    save: jest.fn((entityOrData: any, maybeData?: any) =>
      Promise.resolve(maybeData ?? { id: 'new-app-1', ...entityOrData }),
    ),
    delete: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn((cb: any) => cb(manager)),
  };

  const notificationQueueService = { createNewJob: jest.fn().mockResolvedValue(undefined) };

  const makeScholarship = (overrides: Record<string, any> = {}) => ({
    id: 'sch-1',
    title: 'Học bổng Vượt khó',
    applicationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    minimumGpa: 3.0,
    minimumGpaScale: 4,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StudentScholarshipsService(
      studentScholarshipsRepository as any,
      scholarshipsRepository as any,
      profileRepository as any,
      studentScholarshipDocumentsRepository as any,
      dataSource as any,
      notificationQueueService as any,
    );
    manager.create.mockImplementation((_entity: any, data: any) => data);
    manager.save.mockImplementation((entityOrData: any, maybeData?: any) =>
      Promise.resolve(maybeData ?? { id: entityOrData.id ?? 'new-app-1', ...entityOrData }),
    );
  });

  describe('registerScholarship (SCH-UC02 — ứng tuyển học bổng trực tuyến)', () => {
    it('rejects when the scholarship does not exist', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.registerScholarship('user-1', { scholarship_id: 'sch-x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects applications submitted after the deadline', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(
        makeScholarship({ applicationDeadline: new Date(Date.now() - 60 * 1000) }),
      );

      await expect(
        service.registerScholarship('user-1', { scholarship_id: 'sch-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a final submission when the student profile is incomplete', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ nationalId: null });
        if (entity === StudentAcademicProfile) return Promise.resolve({ gpa: 3.5 });
        return Promise.resolve(null);
      });

      await expect(
        service.registerScholarship('user-1', {
          scholarship_id: 'sch-1',
          isDraft: false,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a final submission when GPA is below the scholarship minimum', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship({ minimumGpa: 3.5 }));
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ nationalId: '123456789012' });
        if (entity === StudentAcademicProfile) return Promise.resolve({ gpa: 2.5 });
        return Promise.resolve(null);
      });

      await expect(
        service.registerScholarship('user-1', {
          scholarship_id: 'sch-1',
          isDraft: false,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects re-applying while an existing application is already under review', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ nationalId: '123456789012' });
        if (entity === StudentAcademicProfile) return Promise.resolve({ gpa: 3.5 });
        if (entity === StudentScholarship)
          return Promise.resolve({ id: 'existing-1', status: StudentScholarshipStatus.UNDER_REVIEW });
        return Promise.resolve(null);
      });

      await expect(
        service.registerScholarship('user-1', {
          scholarship_id: 'sch-1',
          isDraft: false,
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new submitted application when eligibility and deadline checks pass', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ nationalId: '123456789012' });
        if (entity === StudentAcademicProfile) return Promise.resolve({ gpa: 3.8 });
        if (entity === StudentScholarship) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        note: 'Em xin ứng tuyển',
        isDraft: false,
      } as any);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.status).toBe(StudentScholarshipStatus.SUBMITTED);
      expect(result.userId).toBe('user-1');
    });

    it('allows saving an incomplete application as a draft without eligibility checks', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship({ minimumGpa: 9 }));
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve(null);
        if (entity === StudentAcademicProfile) return Promise.resolve(null);
        if (entity === StudentScholarship) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        isDraft: true,
      } as any);

      expect(result.status).toBe(StudentScholarshipStatus.DRAFT);
    });

    it('creates a new personal profile / academic profile when saving nationalId & gpa for the first time', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve(null);
        if (entity === StudentAcademicProfile) return Promise.resolve(null);
        if (entity === StudentScholarship) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        isDraft: true,
        nationalId: '123456789012',
        gpa: 3.5,
      } as any);

      expect(manager.save).toHaveBeenCalledWith(UserProfile, expect.objectContaining({ nationalId: '123456789012' }));
      expect(manager.save).toHaveBeenCalledWith(StudentAcademicProfile, expect.objectContaining({ gpa: 3.5 }));
    });

    it('updates the existing personal profile / academic profile when they already exist', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ id: 'profile-1', nationalId: null });
        if (entity === StudentAcademicProfile) return Promise.resolve({ id: 'academic-1', gpa: null });
        if (entity === StudentScholarship) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        isDraft: true,
        nationalId: '123456789012',
        gpa: 3.5,
      } as any);

      expect(manager.update).toHaveBeenCalledWith(
        UserProfile,
        { id: 'profile-1' },
        expect.objectContaining({ nationalId: '123456789012' }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        StudentAcademicProfile,
        { id: 'academic-1' },
        expect.objectContaining({ gpa: 3.5 }),
      );
    });

    it('updates an existing editable (DRAFT) application in place, stamping applicationDate on final submission', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      const existing = { id: 'existing-1', status: StudentScholarshipStatus.DRAFT, note: 'cũ' };
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve({ nationalId: '123456789012' });
        if (entity === StudentAcademicProfile) return Promise.resolve({ gpa: 3.8 });
        if (entity === StudentScholarship) return Promise.resolve(existing);
        return Promise.resolve(null);
      });

      const result = await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        note: 'Cập nhật hồ sơ',
        isDraft: false,
        documents: [{ document_id: 'doc-1', file_url: 'https://s3/doc-1.pdf' }],
      } as any);

      expect(manager.delete).toHaveBeenCalledWith(StudentScholarshipDocument, { studentScholarshipId: 'existing-1' });
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ documentId: 'doc-1' })]),
      );
      expect(result.status).toBe(StudentScholarshipStatus.SUBMITTED);
      expect(result.applicationDate).toBeInstanceOf(Date);
    });

    it('skips the audit log entry when resubmitting a draft with the same target status', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(makeScholarship());
      const existing = { id: 'existing-1', status: StudentScholarshipStatus.DRAFT, note: 'cũ' };
      manager.findOne.mockImplementation((entity: any) => {
        if (entity === UserProfile) return Promise.resolve(null);
        if (entity === StudentAcademicProfile) return Promise.resolve(null);
        if (entity === StudentScholarship) return Promise.resolve(existing);
        return Promise.resolve(null);
      });
      manager.save.mockClear();

      await service.registerScholarship('user-1', {
        scholarship_id: 'sch-1',
        isDraft: true,
      } as any);

      const historySaveCalls = manager.save.mock.calls.filter(
        (call: any[]) => call[0] === StudentScholarshipHistory,
      );
      expect(historySaveCalls).toHaveLength(0);
    });
  });

  describe('updateStatus (SCH-UC03 — xét duyệt hồ sơ học bổng)', () => {
    it('updates the application status, stamps a decision date and notifies the student', async () => {
      studentScholarshipsRepository.updateStatus.mockResolvedValue({
        id: 'app-1',
        status: 'approved',
      });
      studentScholarshipsRepository.findByIdWithUserAndAccount.mockResolvedValue({
        id: 'app-1',
        user: { account: { accountId: 'acc-1' } },
        scholarship: { title: 'Học bổng Vượt khó' },
      });

      const result = await service.updateStatus('app-1', {
        status: 'approved',
        reviewerId: 'reviewer-1',
      } as any);

      expect(studentScholarshipsRepository.updateStatus).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ status: 'approved', decisionDate: expect.any(Date) }),
        'reviewer-1',
      );
      expect(notificationQueueService.createNewJob).toHaveBeenCalled();
      expect(result.status).toBe('approved');
    });

    it('uses the provided decisionDate instead of the current date when given', async () => {
      studentScholarshipsRepository.updateStatus.mockResolvedValue({ id: 'app-1', status: 'pending' });
      studentScholarshipsRepository.findByIdWithUserAndAccount.mockResolvedValue(null);

      await service.updateStatus('app-1', {
        status: 'pending',
        reviewerId: 'reviewer-1',
        decisionDate: '2026-07-01T00:00:00.000Z',
      } as any);

      expect(studentScholarshipsRepository.updateStatus).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ decisionDate: new Date('2026-07-01T00:00:00.000Z') }),
        'reviewer-1',
      );
    });

    it('does not notify when the student has no linked account', async () => {
      studentScholarshipsRepository.updateStatus.mockResolvedValue({ id: 'app-1', status: 'approved' });
      studentScholarshipsRepository.findByIdWithUserAndAccount.mockResolvedValue({
        id: 'app-1',
        user: { account: null },
      });

      await service.updateStatus('app-1', { status: 'approved', reviewerId: 'reviewer-1' } as any);

      expect(notificationQueueService.createNewJob).not.toHaveBeenCalled();
    });

    it('swallows notification failures without failing the status update', async () => {
      studentScholarshipsRepository.updateStatus.mockResolvedValue({ id: 'app-1', status: 'approved' });
      studentScholarshipsRepository.findByIdWithUserAndAccount.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateStatus('app-1', { status: 'approved', reviewerId: 'reviewer-1' } as any),
      ).resolves.toMatchObject({ status: 'approved' });
    });

    it('wraps a missing application as a NotFoundException', async () => {
      studentScholarshipsRepository.updateStatus.mockRejectedValue(new Error('not found'));

      await expect(
        service.updateStatus('app-missing', { status: 'approved', reviewerId: 'reviewer-1' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll / findByOrganization / findOne / create', () => {
    it('findAll forwards pagination params to the repository', async () => {
      studentScholarshipsRepository.findAll.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });

      await service.findAll('user-1', 'sch-1', 1, 10);

      expect(studentScholarshipsRepository.findAll).toHaveBeenCalledWith('user-1', 'sch-1', 1, 10);
    });

    it('findByOrganization forwards pagination params to the repository', async () => {
      studentScholarshipsRepository.findByOrganization.mockResolvedValue({ items: [], total: 0 });

      await service.findByOrganization('org-1', 1, 10);

      expect(studentScholarshipsRepository.findByOrganization).toHaveBeenCalledWith('org-1', 1, 10);
    });

    it('findOne throws NotFoundException when the application does not exist', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('app-x')).rejects.toThrow(NotFoundException);
    });

    it('findOne returns the application when found', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue({ id: 'app-1' });

      const result = await service.findOne('app-1', 'user-1');

      expect(result).toEqual({ id: 'app-1' });
    });

    it('create delegates to the repository', async () => {
      studentScholarshipsRepository.create.mockResolvedValue({ id: 'app-1' });

      const result = await service.create({ scholarship_id: 'sch-1' } as any, 'user-1');

      expect(studentScholarshipsRepository.create).toHaveBeenCalledWith({ scholarship_id: 'sch-1' }, 'user-1');
      expect(result).toEqual({ id: 'app-1' });
    });
  });

  describe('update', () => {
    it('updates the application successfully', async () => {
      studentScholarshipsRepository.update.mockResolvedValue({ id: 'app-1', note: 'updated' });

      const result = await service.update('app-1', { note: 'updated' } as any, 'user-1');

      expect(result).toEqual({ id: 'app-1', note: 'updated' });
    });

    it('wraps a missing application as NotFoundException', async () => {
      studentScholarshipsRepository.update.mockRejectedValue(new Error('Application not found'));

      await expect(
        service.update('app-x', { note: 'x' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('wraps a non-editable application as BadRequestException', async () => {
      studentScholarshipsRepository.update.mockRejectedValue(new Error('Cannot update a submitted application'));

      await expect(
        service.update('app-1', { note: 'x' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('re-throws unrelated repository errors', async () => {
      studentScholarshipsRepository.update.mockRejectedValue(new Error('unexpected db error'));

      await expect(service.update('app-1', { note: 'x' } as any, 'user-1')).rejects.toThrow(
        'unexpected db error',
      );
    });
  });

  describe('getUserScholarshipDetail', () => {
    it('throws NotFoundException when the application does not belong to the student', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserScholarshipDetail('user-1', 'app-x')).rejects.toThrow(NotFoundException);
    });

    it('returns the application when found', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue({ id: 'app-1' });

      const result = await service.getUserScholarshipDetail('user-1', 'app-1');

      expect(result).toEqual({ id: 'app-1' });
    });
  });

  describe('submit', () => {
    it('rejects submitting an application that is not owned by the student', async () => {
      studentScholarshipsRepository.submit.mockRejectedValue(new Error('Application not found'));

      await expect(
        service.submit('app-1', { submittedFormUrl: 'https://s3/file.pdf' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects submitting an application that is not in a submittable state', async () => {
      studentScholarshipsRepository.submit.mockRejectedValue(
        new Error('Can only submit draft applications'),
      );

      await expect(
        service.submit('app-1', { submittedFormUrl: 'https://s3/file.pdf' } as any, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('submits a draft application successfully', async () => {
      studentScholarshipsRepository.submit.mockResolvedValue({ id: 'app-1', status: 'submitted' });

      const result = await service.submit(
        'app-1',
        { submittedFormUrl: 'https://s3/file.pdf' } as any,
        'user-1',
      );

      expect(result.status).toBe('submitted');
    });
  });

  describe('remove', () => {
    it('rejects deleting an application that cannot be deleted anymore', async () => {
      studentScholarshipsRepository.remove.mockRejectedValue(new Error('Can only delete draft applications'));

      await expect(service.remove('app-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deletes a draft application owned by the student', async () => {
      studentScholarshipsRepository.remove.mockResolvedValue(undefined);

      await expect(service.remove('app-1', 'user-1')).resolves.toBeUndefined();
      expect(studentScholarshipsRepository.remove).toHaveBeenCalledWith('app-1', 'user-1');
    });
  });

  describe('confirmAward', () => {
    // NOTE: as currently implemented, confirmAward() unconditionally throws
    // BadRequestException before checking application status — this test
    // pins down that observed behavior; see report notes for follow-up.
    it('currently rejects every confirmation attempt regardless of application status', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue({
        id: 'app-1',
        status: StudentScholarshipStatus.APPROVED,
      });

      await expect(
        service.confirmAward('app-1', 'user-1', true),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserScholarships (danh sách hồ sơ đã ứng tuyển của sinh viên)', () => {
    it('builds pagination metadata from the repository result', async () => {
      studentScholarshipsRepository.findAll.mockResolvedValue({
        items: [{ id: 'app-1' }, { id: 'app-2' }],
        total: 12,
        page: 2,
        limit: 2,
      });

      const result = await service.getUserScholarships('user-1', { page: 2, limit: 2 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 12,
        per_page: 2,
        current_page: 2,
        total_pages: 6,
        from: 3,
        to: 4,
      });
    });
  });

  describe('unregisterScholarship (rút hồ sơ ứng tuyển)', () => {
    it('rejects unregistering an application that does not belong to the student', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(service.unregisterScholarship('user-1', 'app-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects cancelling an application that is no longer in a cancellable state', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue({ id: 'app-1', status: StudentScholarshipStatus.APPROVED });
      studentScholarshipsRepository.cancelApplication.mockResolvedValue(false);

      await expect(service.unregisterScholarship('user-1', 'app-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('cancels a draft/submitted application owned by the student', async () => {
      studentScholarshipsRepository.findOne.mockResolvedValue({ id: 'app-1', status: StudentScholarshipStatus.DRAFT });
      studentScholarshipsRepository.cancelApplication.mockResolvedValue(true);

      await expect(service.unregisterScholarship('user-1', 'app-1')).resolves.toBeUndefined();
      expect(studentScholarshipsRepository.cancelApplication).toHaveBeenCalledWith('app-1', 'user-1');
    });
  });
});
