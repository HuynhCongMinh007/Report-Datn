import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminAcademicService } from './admin-academic.service';

describe('AdminAcademicService (ACA-UC01 — quản trị danh mục học thuật)', () => {
  let service: AdminAcademicService;

  const makeQueryBuilder = (result: any[]) => {
    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return qb;
  };

  const universityRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const subjectRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const trainingProgramRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminAcademicService(
      universityRepository as any,
      subjectRepository as any,
      trainingProgramRepository as any,
    );
  });

  describe('getUniversities', () => {
    it('applies search, type, status and city filters to the query builder', async () => {
      const qb = makeQueryBuilder([{ id: 'uni-1', name: 'Đại học Bách Khoa' }]);
      universityRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getUniversities({
        search: 'bách khoa',
        type: 'public',
        status: 'Active',
        city: 'Hà Nội',
      } as any);

      expect(qb.andWhere).toHaveBeenCalledTimes(4);
      expect(result).toHaveLength(1);
    });
  });

  describe('updateUniversity', () => {
    it('rejects updating a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateUniversity('uni-x', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies partial updates to an existing university', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1', name: 'Old name' });
      universityRepository.save.mockImplementation((u: any) => Promise.resolve(u));

      const result = await service.updateUniversity('uni-1', { name: 'New name' } as any);

      expect(result.name).toBe('New name');
    });
  });

  describe('deleteUniversity', () => {
    it('rejects deleting a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteUniversity('uni-x')).rejects.toThrow(NotFoundException);
    });

    it('translates a foreign-key removal failure into a BadRequestException', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      universityRepository.remove.mockRejectedValue(new Error('FK constraint violation'));

      await expect(service.deleteUniversity('uni-1')).rejects.toThrow(BadRequestException);
    });

    it('deletes a university that has no dependent records', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      universityRepository.remove.mockResolvedValue(undefined);

      const result = await service.deleteUniversity('uni-1');

      expect(result).toEqual({ success: true, message: 'University deleted successfully' });
    });
  });

  describe('createUniversitySubject', () => {
    it('rejects adding a subject to a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createUniversitySubject('uni-x', { subject_code: 'CSC10001' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a subject under an existing university', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      subjectRepository.create.mockImplementation((data: any) => data);
      subjectRepository.save.mockImplementation((data: any) => Promise.resolve({ id: 'subj-1', ...data }));

      const result = await service.createUniversitySubject('uni-1', {
        subject_code: 'CSC10001',
        subject_name: 'Introduction to Programming',
        credits: 4,
        grade_scale: '10',
      } as any);

      expect(result.subjectCode).toBe('CSC10001');
      expect(result.universityId).toBe('uni-1');
    });
  });

  describe('bulkCreateSubjects (nhập danh mục môn học hàng loạt)', () => {
    it('rejects bulk import for a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.bulkCreateSubjects('uni-x', { subjects: [{ subject_code: 'CSC10001' }] } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty subject list', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });

      await expect(
        service.bulkCreateSubjects('uni-1', { subjects: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('bulk-creates every subject row from the imported file', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      subjectRepository.create.mockImplementation((data: any) => data);
      subjectRepository.save.mockImplementation((rows: any[]) =>
        Promise.resolve(rows.map((r, i) => ({ id: `subj-${i}`, ...r }))),
      );

      const result = await service.bulkCreateSubjects('uni-1', {
        subjects: [
          { subject_code: 'CSC10001', subject_name: 'Intro to Programming', credits: 4 },
          { subject_code: 'CSC10003', subject_name: 'Data Structures', credits: 4 },
        ],
      } as any);

      expect(result).toHaveLength(2);
      expect(subjectRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ subjectCode: 'CSC10001' })]),
      );
    });
  });

  describe('deleteSubject', () => {
    it('translates a dependent-grades removal failure into a BadRequestException', async () => {
      subjectRepository.findOne.mockResolvedValue({ id: 'subj-1' });
      subjectRepository.remove.mockRejectedValue(new Error('FK constraint violation'));

      await expect(service.deleteSubject('subj-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createUniversityTrainingProgram / updateTrainingProgram', () => {
    it('rejects adding a training program to a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createUniversityTrainingProgram('uni-x', { program_code: 'CS' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a training program under an existing university', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      trainingProgramRepository.create.mockImplementation((data: any) => data);
      trainingProgramRepository.save.mockImplementation((data: any) =>
        Promise.resolve({ id: 'prog-1', ...data }),
      );

      const result = await service.createUniversityTrainingProgram('uni-1', {
        program_code: 'CS',
        program_name: 'Computer Science',
      } as any);

      expect(result.programCode).toBe('CS');
      expect(result.universityId).toBe('uni-1');
    });

    it('rejects updating a training program that does not exist', async () => {
      trainingProgramRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateTrainingProgram('prog-x', { program_name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies a partial update to an existing training program', async () => {
      trainingProgramRepository.findOne.mockResolvedValue({ id: 'prog-1', programName: 'Old name' });
      trainingProgramRepository.save.mockImplementation((p: any) => Promise.resolve(p));

      const result = await service.updateTrainingProgram('prog-1', { program_name: 'New name' } as any);

      expect(result.programName).toBe('New name');
    });
  });

  describe('deleteTrainingProgram', () => {
    it('rejects deleting a training program that does not exist', async () => {
      trainingProgramRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteTrainingProgram('prog-x')).rejects.toThrow(NotFoundException);
    });

    it('translates a dependent-reference removal failure into a BadRequestException', async () => {
      trainingProgramRepository.findOne.mockResolvedValue({ id: 'prog-1' });
      trainingProgramRepository.remove.mockRejectedValue(new Error('FK constraint violation'));

      await expect(service.deleteTrainingProgram('prog-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkCreateTrainingPrograms (nhập danh mục chương trình đào tạo hàng loạt)', () => {
    it('rejects bulk import for a university that does not exist', async () => {
      universityRepository.findOne.mockResolvedValue(null);

      await expect(
        service.bulkCreateTrainingPrograms('uni-x', { programs: [{ program_code: 'CS' }] } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an empty training program list', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });

      await expect(
        service.bulkCreateTrainingPrograms('uni-1', { programs: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('bulk-creates every training program row from the imported file', async () => {
      universityRepository.findOne.mockResolvedValue({ id: 'uni-1' });
      trainingProgramRepository.create.mockImplementation((data: any) => data);
      trainingProgramRepository.save.mockImplementation((rows: any[]) =>
        Promise.resolve(rows.map((r, i) => ({ id: `prog-${i}`, ...r }))),
      );

      const result = await service.bulkCreateTrainingPrograms('uni-1', {
        programs: [
          { program_code: 'CS', program_name: 'Computer Science' },
          { program_code: 'SE', program_name: 'Software Engineering' },
        ],
      } as any);

      expect(result).toHaveLength(2);
    });
  });
});
