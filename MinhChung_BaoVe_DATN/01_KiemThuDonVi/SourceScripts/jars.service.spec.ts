import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JarsService } from './jars.service';
import { JARS_CONST } from './constants/jars.constant';

describe('JarsService', () => {
  let service: JarsService;

  const jarsRepository = {
    findJarById: jest.fn(),
    createDefaultSystemJarCategories: jest.fn(),
    findJarsForUser: jest.fn(),
    findUserJarByName: jest.fn(),
    createJar: jest.fn(),
    findUserJarById: jest.fn(),
    updateUserJar: jest.fn(),
    findActiveUserJars: jest.fn(),
    deleteUserJar: jest.fn(),
    findUserJarByIdOrCode: jest.fn(),
    findJarTagBySlug: jest.fn(),
    createJarTag: jest.fn(),
    findJarTagById: jest.fn(),
    updateJarTag: jest.fn(),
    softDeleteJarTag: jest.fn(),
    slugifyTagName: jest.fn((name: string) =>
      name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'),
    ),
  };

  const makeJar = (overrides: Record<string, any> = {}) => ({
    id: 'jar-1',
    name: 'Thiết yếu',
    categoryType: 'essentials',
    icon: 'Utensils',
    color: '#3B82F6',
    percentage: 55,
    currentBalance: 0,
    isSystem: true,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JarsService(jarsRepository as any);
  });

  describe('createJar (thiết lập cấu hình 6 lọ)', () => {
    it('rejects when jar name already exists for the user', async () => {
      jarsRepository.findUserJarByName.mockResolvedValue(makeJar());

      await expect(
        service.createJar('user-1', { name: 'Thiết yếu' } as any),
      ).rejects.toThrow(ConflictException);
      expect(jarsRepository.createJar).not.toHaveBeenCalled();
    });

    it('creates a new custom jar when name is unique', async () => {
      jarsRepository.findUserJarByName.mockResolvedValue(null);
      jarsRepository.createJar.mockResolvedValue(
        makeJar({ id: 'jar-new', name: 'Du lịch', isSystem: false }),
      );

      const result = await service.createJar('user-1', {
        name: 'Du lịch',
        description: 'Quỹ du lịch',
        categoryType: 'custom',
        icon: 'Plane',
        color: '#00FF00',
      } as any);

      expect(jarsRepository.createJar).toHaveBeenCalledWith(
        'user-1',
        { name: 'Du lịch', description: 'Quỹ du lịch' },
        { categoryType: 'custom', icon: 'Plane', color: '#00FF00' },
      );
      expect(result.name).toBe('Du lịch');
    });
  });

  describe('updateJarPercentages (thiết lập tỷ lệ 6 lọ)', () => {
    it('rejects when total percentage is not 100', async () => {
      await expect(
        service.updateJarPercentages('user-1', {
          jars: [
            { categoryId: 'jar-1', percentage: 60 },
            { categoryId: 'jar-2', percentage: 30 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(jarsRepository.updateUserJar).not.toHaveBeenCalled();
    });

    it('rejects when one of the jars does not belong to the user', async () => {
      jarsRepository.findUserJarById
        .mockResolvedValueOnce(makeJar({ id: 'jar-1' }))
        .mockResolvedValueOnce(null);

      await expect(
        service.updateJarPercentages('user-1', {
          jars: [
            { categoryId: 'jar-1', percentage: 60 },
            { categoryId: 'jar-2', percentage: 40 },
          ],
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(jarsRepository.updateUserJar).not.toHaveBeenCalled();
    });

    it('updates all jars when total percentage equals 100', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar());
      jarsRepository.updateUserJar.mockResolvedValue(makeJar());

      await service.updateJarPercentages('user-1', {
        jars: [
          { categoryId: 'jar-1', percentage: 60 },
          { categoryId: 'jar-2', percentage: 40 },
        ],
      } as any);

      expect(jarsRepository.updateUserJar).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateJarAllocations (cấu hình phân bổ lọ)', () => {
    it('rejects when total allocation percentage is not 100', async () => {
      await expect(
        service.updateJarAllocations('user-1', {
          allocations: [{ id: 'jar-1', name: 'Thiết yếu', percentage: 50 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects deleting a custom jar that still has balance', async () => {
      jarsRepository.findJarsForUser.mockResolvedValue([
        makeJar({ id: 'jar-1', isSystem: true }),
        makeJar({ id: 'jar-2', isSystem: false, currentBalance: 50000 }),
      ]);
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ id: 'jar-1' }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ id: 'jar-1' }));

      await expect(
        service.updateJarAllocations('user-1', {
          allocations: [{ id: 'jar-1', name: 'Thiết yếu', percentage: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(jarsRepository.deleteUserJar).not.toHaveBeenCalled();
    });

    it('creates a new custom jar and removes zero-balance jars no longer allocated', async () => {
      jarsRepository.findJarsForUser.mockResolvedValue([
        makeJar({ id: 'jar-old', isSystem: false, currentBalance: 0 }),
      ]);
      jarsRepository.createJar.mockResolvedValue(
        makeJar({ id: 'jar-new', name: 'Đầu tư', isSystem: false }),
      );
      jarsRepository.deleteUserJar.mockResolvedValue(true);
      jarsRepository.findJarById.mockResolvedValue(makeJar());
      jarsRepository.findActiveUserJars.mockResolvedValue([
        makeJar({ id: 'jar-new', name: 'Đầu tư', percentage: 100 }),
      ]);

      const result = await service.updateJarAllocations('user-1', {
        allocations: [
          { name: 'Đầu tư', percentage: 100, code: 'investment' },
        ],
      } as any);

      expect(jarsRepository.createJar).toHaveBeenCalled();
      expect(jarsRepository.deleteUserJar).toHaveBeenCalledWith('jar-old', 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Đầu tư');
    });
  });

  describe('getJarAllocations', () => {
    it('bootstraps default system jars when user has none yet', async () => {
      jarsRepository.findJarById.mockResolvedValue(null);
      jarsRepository.findActiveUserJars.mockResolvedValue([makeJar()]);

      const result = await service.getJarAllocations('user-1');

      expect(jarsRepository.createDefaultSystemJarCategories).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        {
          id: 'jar-1',
          code: 'essentials',
          name: 'Thiết yếu',
          icon: 'Utensils',
          percentage: 55,
          color: '#3B82F6',
        },
      ]);
    });
  });

  describe('updateJar (bảo vệ hũ hệ thống)', () => {
    it('rejects renaming a system jar (only icon/color may change)', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: true }));

      await expect(
        service.updateJar('user-1', 'jar-1', { name: 'Tên mới' } as any),
      ).rejects.toThrow('System jars can only have their percentage, icon, and color modified');
    });

    it('allows changing icon/color of a system jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: true }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ icon: 'Star' }));

      const result = await service.updateJar('user-1', 'jar-1', { icon: 'Star' } as any);

      expect(result.icon).toBe('Star');
    });

    it('allows renaming a custom (non-system) jar', async () => {
      jarsRepository.findUserJarById.mockResolvedValue(makeJar({ isSystem: false }));
      jarsRepository.updateUserJar.mockResolvedValue(makeJar({ isSystem: false, name: 'Quỹ mới' }));

      const result = await service.updateJar('user-1', 'jar-1', { name: 'Quỹ mới' } as any);

      expect(result.name).toBe('Quỹ mới');
    });
  });

  describe('createJarTag / deleteJarTag (quản lý thẻ chi tiêu trong hũ)', () => {
    it('rejects creating a tag whose name already exists in the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTagBySlug.mockResolvedValue({ id: 'tag-1', slug: 'an-uong' });

      await expect(
        service.createJarTag('user-1', 'jar-1', { name: 'Ăn uống' } as any),
      ).rejects.toThrow(ConflictException);
      expect(jarsRepository.createJarTag).not.toHaveBeenCalled();
    });

    it('creates a new tag when the slug is unique within the jar', async () => {
      jarsRepository.findUserJarByIdOrCode.mockResolvedValue(makeJar());
      jarsRepository.findJarTagBySlug.mockResolvedValue(null);
      jarsRepository.createJarTag.mockResolvedValue({
        id: 'tag-new',
        name: 'Xăng xe',
        slug: 'xang-xe',
        moneyJar: makeJar(),
      });

      const result = await service.createJarTag('user-1', 'jar-1', { name: 'Xăng xe' } as any);

      expect(result.id).toBe('tag-new');
    });

    it('protects the default "Khác" tag from deletion', async () => {
      jarsRepository.findJarTagById.mockResolvedValue({ id: 'tag-khac', slug: 'khac', isDefault: true });

      await expect(service.deleteJarTag('user-1', 'tag-khac')).rejects.toThrow(BadRequestException);
      expect(jarsRepository.softDeleteJarTag).not.toHaveBeenCalled();
    });

    it('soft-deletes a non-default tag owned by the user', async () => {
      jarsRepository.findJarTagById.mockResolvedValue({ id: 'tag-1', slug: 'giai-tri', isDefault: false });

      await service.deleteJarTag('user-1', 'tag-1');

      expect(jarsRepository.softDeleteJarTag).toHaveBeenCalledWith('tag-1');
    });
  });
});
