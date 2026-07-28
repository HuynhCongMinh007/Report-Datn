import { NotFoundException } from '@nestjs/common';
import { StudentAcademicService } from './student-academic.service';

describe('StudentAcademicService', () => {
  let service: StudentAcademicService;

  const universityRepository = { find: jest.fn() };
  const subjectRepository = { find: jest.fn(), findOne: jest.fn() };
  const gradeRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const studentProfileRepository = { findOne: jest.fn(), save: jest.fn() };
  const trainingProgramRepository = { find: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StudentAcademicService(
      universityRepository as any,
      subjectRepository as any,
      gradeRepository as any,
      studentProfileRepository as any,
      trainingProgramRepository as any,
    );
    gradeRepository.create.mockImplementation((data: any) => data);
  });

  const makeSubject = (overrides: Record<string, any> = {}) => ({
    id: 'subj-1',
    subjectCode: 'CSC10001',
    credits: 4,
    gradeScale: '10',
    ...overrides,
  });

  describe('saveGrade (ACA-UC02 — nhập điểm từng môn)', () => {
    it('creates a new grade record when the student has not graded this subject before', async () => {
      subjectRepository.findOne.mockResolvedValue(makeSubject());
      gradeRepository.findOne.mockResolvedValue(null);
      gradeRepository.save.mockImplementation((g: any) => Promise.resolve({ id: 'grade-1', ...g }));

      const result = await service.saveGrade('user-1', {
        grades: [{ subject_id: 'subj-1', grade: 8.5 }],
      } as any);

      expect(result).toHaveLength(1);
      expect(result[0].grade).toBe(8.5);
      expect(gradeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'user-1', subjectId: 'subj-1', grade: 8.5 }),
      );
    });

    it('updates the existing grade when the student re-submits a score for the same subject', async () => {
      subjectRepository.findOne.mockResolvedValue(makeSubject());
      const existingGrade = { id: 'grade-1', studentId: 'user-1', subjectId: 'subj-1', grade: 6 };
      gradeRepository.findOne.mockResolvedValue(existingGrade);
      gradeRepository.save.mockImplementation((g: any) => Promise.resolve(g));

      const result = await service.saveGrade('user-1', {
        grades: [{ subject_id: 'subj-1', grade: 9 }],
      } as any);

      expect(result[0].id).toBe('grade-1');
      expect(result[0].grade).toBe(9);
    });

    it('skips rows whose subject_id is not in the standard subject catalogue', async () => {
      subjectRepository.findOne.mockResolvedValue(null);

      const result = await service.saveGrade('user-1', {
        grades: [{ subject_id: 'subj-unknown', grade: 8 }],
      } as any);

      expect(result).toHaveLength(0);
      expect(gradeRepository.save).not.toHaveBeenCalled();
    });

    it('bulk-saves every valid row from a batch import in one call (ACA-UC03 — nhập điểm hàng loạt từ file)', async () => {
      subjectRepository.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          ['subj-1', 'subj-2', 'subj-3'].includes(where.id) ? makeSubject({ id: where.id }) : null,
        ),
      );
      gradeRepository.findOne.mockResolvedValue(null);
      gradeRepository.save.mockImplementation((g: any) => Promise.resolve({ id: `grade-${g.subjectId}`, ...g }));

      const result = await service.saveGrade('user-1', {
        grades: [
          { subject_id: 'subj-1', grade: 8 },
          { subject_id: 'subj-2', grade: 7.5 },
          { subject_id: 'subj-3', grade: 9 },
          { subject_id: 'subj-not-in-catalog', grade: 5 },
        ],
      } as any);

      expect(result).toHaveLength(3);
      expect(gradeRepository.save).toHaveBeenCalledTimes(3);
    });
  });

  describe('deleteGrade', () => {
    it('rejects deleting a grade that does not belong to the student', async () => {
      gradeRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteGrade('user-1', 'grade-x')).rejects.toThrow(NotFoundException);
    });

    it('removes an owned grade record', async () => {
      const grade = { id: 'grade-1', studentId: 'user-1' };
      gradeRepository.findOne.mockResolvedValue(grade);

      const result = await service.deleteGrade('user-1', 'grade-1');

      expect(gradeRepository.remove).toHaveBeenCalledWith(grade);
      expect(result).toEqual({ success: true, message: 'Grade deleted successfully' });
    });
  });

  describe('getDashboard (tính GPA tích lũy theo tín chỉ)', () => {
    it('computes the credit-weighted GPA across all recorded grades', async () => {
      studentProfileRepository.findOne.mockResolvedValue({ targetCredits: 120, targetNote: 'Ra trường đúng hạn' });
      gradeRepository.find.mockResolvedValue([
        { grade: 8, subject: { credits: 3 } },
        { grade: 9, subject: { credits: 2 } },
        { grade: 7, subject: { credits: 4 } },
      ]);

      const result = await service.getDashboard('user-1');

      // (8*3 + 9*2 + 7*4) / (3+2+4) = 70 / 9 = 7.78
      expect(result.gpa).toBe(7.78);
      expect(result.totalCredits).toBe(9);
      expect(result.targetCredits).toBe(120);
    });

    it('returns a zero GPA when the student has no recorded grades yet', async () => {
      studentProfileRepository.findOne.mockResolvedValue(null);
      gradeRepository.find.mockResolvedValue([]);

      const result = await service.getDashboard('user-1');

      expect(result.gpa).toBe(0);
      expect(result.totalCredits).toBe(0);
      expect(result.targetCredits).toBeNull();
    });
  });

  describe('updateGradebookTarget', () => {
    it('rejects updating a target for a student without an academic profile', async () => {
      studentProfileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateGradebookTarget('user-1', { targetCredits: 130 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the credit target and trims the target note', async () => {
      const profile = { id: 'profile-1', targetCredits: 120, targetNote: null };
      studentProfileRepository.findOne.mockResolvedValue(profile);
      studentProfileRepository.save.mockImplementation((p: any) => Promise.resolve(p));

      const result = await service.updateGradebookTarget('user-1', {
        targetCredits: 130,
        targetNote: '  Cố gắng học kỳ này  ',
      } as any);

      expect(result.targetCredits).toBe(130);
      expect(result.targetNote).toBe('Cố gắng học kỳ này');
    });
  });

  describe('getGradebookTarget', () => {
    it('returns null targets when the student has no academic profile yet', async () => {
      studentProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.getGradebookTarget('user-1');

      expect(result).toEqual({ targetCredits: null, targetNote: null });
    });

    it('returns the configured credit target for an existing profile', async () => {
      studentProfileRepository.findOne.mockResolvedValue({ targetCredits: 140, targetNote: 'Ra trường sớm' });

      const result = await service.getGradebookTarget('user-1');

      expect(result).toEqual({ targetCredits: 140, targetNote: 'Ra trường sớm' });
    });
  });

  describe('getUniversitySubjectsDropdown / getTrainingProgramsDropdown (tra cứu danh mục học thuật)', () => {
    it('returns an empty list when the student has not selected a university yet', async () => {
      studentProfileRepository.findOne.mockResolvedValue(null);

      const result = await service.getUniversitySubjectsDropdown('user-1');

      expect(result).toEqual([]);
      expect(subjectRepository.find).not.toHaveBeenCalled();
    });

    it('returns the active subjects of the student\'s selected university', async () => {
      studentProfileRepository.findOne.mockResolvedValue({ universityId: 'uni-1' });
      subjectRepository.find.mockResolvedValue([makeSubject()]);

      const result = await service.getUniversitySubjectsDropdown('user-1');

      expect(result).toHaveLength(1);
      expect(subjectRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { universityId: 'uni-1', status: 'Active' } }),
      );
    });

    it('lists active training programs for a given university', async () => {
      trainingProgramRepository.find.mockResolvedValue([{ id: 'prog-1', programName: 'Computer Science' }]);

      const result = await service.getTrainingProgramsDropdown('uni-1');

      expect(result).toHaveLength(1);
      expect(trainingProgramRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { universityId: 'uni-1', status: 'Active' } }),
      );
    });
  });
});
