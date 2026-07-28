import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScholarshipsService } from './scholarships.service';
import {
  ScholarshipCompetitionLevel,
  ScholarshipRecurrenceType,
} from '@/database/entities';

describe('ScholarshipsService (SCH-UC01 — nhà tài trợ quản lý chương trình học bổng)', () => {
  let service: ScholarshipsService;

  const scholarshipsRepository = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findByProviderId: jest.fn(),
    searchByName: jest.fn(),
    findOpenApplication: jest.fn(),
  };

  const studentScholarshipsRepository = {
    countByScholarshipIds: jest.fn(),
    findRecentByScholarshipIds: jest.fn(),
  };

  const configService = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScholarshipsService(
      scholarshipsRepository as any,
      studentScholarshipsRepository as any,
      configService as any,
    );
    studentScholarshipsRepository.countByScholarshipIds.mockResolvedValue({});
  });

  describe('create', () => {
    it('rejects a minimum GPA above the scale (4.0)', async () => {
      await expect(
        service.create({
          title: 'Học bổng Vượt khó',
          minimumGpa: 4.5,
          minimumGpaScale: 4,
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(scholarshipsRepository.create).not.toHaveBeenCalled();
    });

    it('accepts a minimum GPA within the 10-point scale and defaults competition level to UNKNOWN', async () => {
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-1' });

      await service.create({
        title: 'Học bổng Tài năng',
        minimumGpa: 8,
        minimumGpaScale: 10,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          minimumGpaScale: 10,
          competitionLevel: ScholarshipCompetitionLevel.UNKNOWN,
        }),
      );
    });

    it('derives competitionLevel from applicantsCount when provided', async () => {
      configService.get.mockImplementation((key: string) =>
        key.includes('lowMax') ? 300 : 1000,
      );
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-2' });

      await service.create({
        title: 'Học bổng Khuyến khích',
        applicantsCount: 1500,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ competitionLevel: ScholarshipCompetitionLevel.HIGH }),
      );
    });

    it('marks recurrenceType as RECURRING when isRecurring is true', async () => {
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-3' });

      await service.create({
        title: 'Học bổng Thường niên',
        isRecurring: true,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ recurrenceType: ScholarshipRecurrenceType.RECURRING }),
      );
    });

    it('falls back to the default competition thresholds (300/1000) when config values are unset', async () => {
      configService.get.mockReturnValue(undefined);
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-4' });

      await service.create({
        title: 'Học bổng Phổ thông',
        applicantsCount: 200,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ competitionLevel: ScholarshipCompetitionLevel.LOW }),
      );
    });

    it('classifies MEDIUM competition when applicantsCount is between the low and medium thresholds', async () => {
      configService.get.mockReturnValue(undefined);
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-5' });

      await service.create({
        title: 'Học bổng Trung bình',
        applicantsCount: 500,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ competitionLevel: ScholarshipCompetitionLevel.MEDIUM }),
      );
    });

    it('keeps an explicitly provided competitionLevel and recurrenceType as-is', async () => {
      scholarshipsRepository.create.mockResolvedValue({ id: 'sch-6' });

      await service.create({
        title: 'Học bổng Đặc biệt',
        competitionLevel: ScholarshipCompetitionLevel.HIGH,
        recurrenceType: ScholarshipRecurrenceType.ONE_TIME,
      } as any);

      expect(scholarshipsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          competitionLevel: ScholarshipCompetitionLevel.HIGH,
          recurrenceType: ScholarshipRecurrenceType.ONE_TIME,
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects updating a scholarship that does not exist', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('sch-missing', { title: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(scholarshipsRepository.update).not.toHaveBeenCalled();
    });

    it('rejects an updated GPA that falls outside the existing scale', async () => {
      scholarshipsRepository.findOne.mockResolvedValue({
        id: 'sch-1',
        minimumGpaScale: 4,
      });

      await expect(
        service.update('sch-1', { minimumGpa: 9 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates an existing scholarship with normalized metadata', async () => {
      scholarshipsRepository.findOne.mockResolvedValue({
        id: 'sch-1',
        minimumGpaScale: 4,
        minimumGpa: 2.5,
      });
      scholarshipsRepository.update.mockResolvedValue({ id: 'sch-1', title: 'Updated title' });

      const result = await service.update('sch-1', { title: 'Updated title' } as any);

      expect(scholarshipsRepository.update).toHaveBeenCalledWith('sch-1', expect.any(Object));
      expect(result.title).toBe('Updated title');
    });
  });

  describe('remove', () => {
    it('rejects removing a scholarship that does not exist', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('sch-missing')).rejects.toThrow(NotFoundException);
      expect(scholarshipsRepository.remove).not.toHaveBeenCalled();
    });

    it('removes an existing scholarship', async () => {
      scholarshipsRepository.findOne.mockResolvedValue({ id: 'sch-1' });

      await service.remove('sch-1');

      expect(scholarshipsRepository.remove).toHaveBeenCalledWith('sch-1');
    });
  });

  describe('findAll', () => {
    it('attaches application counts and default GPA scale to each scholarship', async () => {
      scholarshipsRepository.findAll.mockResolvedValue({
        items: [{ id: 'sch-1', title: 'Học bổng A' }],
        total: 1,
        page: 1,
        limit: 20,
      });
      studentScholarshipsRepository.countByScholarshipIds.mockResolvedValue({ 'sch-1': 7 });

      const result = await service.findAll({});

      expect(result.items[0].applicationCount).toBe(7);
      expect(result.items[0].minimumGpaScale).toBe(4);
    });
  });

  describe('findOne', () => {
    it('rejects fetching a scholarship that does not exist', async () => {
      scholarshipsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('sch-missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the scholarship with normalized GPA scale defaults', async () => {
      scholarshipsRepository.findOne.mockResolvedValue({ id: 'sch-1', minimumGpaScale: null });

      const result = await service.findOne('sch-1');

      expect(result.minimumGpaScale).toBe(4);
    });
  });

  describe('getOrganizationSummary (tổng quan chương trình của nhà tài trợ)', () => {
    it('aggregates scholarship count, budget and application totals for the organization', async () => {
      scholarshipsRepository.findByProviderId.mockResolvedValue([
        { id: 'sch-1', amount: 5000000, quantity: 2, isActive: true },
        { id: 'sch-2', amount: 3000000, quantity: 1, isActive: false },
      ]);
      studentScholarshipsRepository.countByScholarshipIds.mockResolvedValue({ 'sch-1': 4, 'sch-2': 1 });
      studentScholarshipsRepository.findRecentByScholarshipIds.mockResolvedValue([]);

      const result = await service.getOrganizationSummary('org-1');

      expect(result.totalScholarships).toBe(2);
      expect(result.activeScholarships).toBe(1);
      expect(result.totalApplications).toBe(5);
      expect(result.totalBudget).toBe(5000000 * 2 + 3000000 * 1);
    });
  });

  describe('searchByName / findOpenApplication (tra cứu danh mục học bổng)', () => {
    it('delegates name search to the repository', async () => {
      scholarshipsRepository.searchByName.mockResolvedValue([{ id: 'sch-1' }]);

      const result = await service.searchByName('Vượt khó');

      expect(scholarshipsRepository.searchByName).toHaveBeenCalledWith('Vượt khó');
      expect(result).toHaveLength(1);
    });

    it('delegates open-application lookup to the repository', async () => {
      scholarshipsRepository.findOpenApplication.mockResolvedValue([{ id: 'sch-2' }]);

      const result = await service.findOpenApplication();

      expect(result).toHaveLength(1);
    });
  });
});
