import { ScholarshipsRepository } from './scholarships.repository';

function makeQueryBuilderMock(overrides: Record<string, any> = {}) {
  const qb: Record<string, jest.Mock> = {};
  ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take'].forEach((method) => {
    qb[method] = jest.fn().mockReturnValue(qb);
  });
  qb.getManyAndCount = jest.fn().mockResolvedValue(overrides.getManyAndCount ?? [[], 0]);
  qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
  return qb;
}

describe('ScholarshipsRepository', () => {
  let repository: ScholarshipsRepository;

  const repo = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    merge: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ScholarshipsRepository(repo as any);
  });

  describe('findAll', () => {
    it('clamps limit to a maximum of 100 and computes skip from page', async () => {
      const qb = makeQueryBuilderMock({ getManyAndCount: [[{ id: 's-1' }], 1] });
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await repository.findAll({ page: 3, limit: 500 });

      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.skip).toHaveBeenCalledWith(200);
      expect(result).toEqual({ items: [{ id: 's-1' }], total: 1, page: 3, limit: 100 });
    });

    it('clamps limit to a minimum of 1', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({ page: 1, limit: 0 });

      expect(qb.take).toHaveBeenCalledWith(1);
    });

    it('applies each optional filter only when its value is provided', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({
        category_id: 'cat-1',
        provider_id: 'provider-1',
        provider: 'ProviderName',
        active: 'true',
        search: 'stem',
        major: 'CS',
        university: 'HCMUS',
        min_value: '1000000',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('scholarship.category_id = :category_id', { category_id: 'cat-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('scholarship.is_active = true');
      expect(qb.andWhere).toHaveBeenCalledWith('scholarship.name ILIKE :name', { name: '%stem%' });
      expect(qb.andWhere).toHaveBeenCalledWith('scholarship.amount >= :min_value', { min_value: 1000000 });
    });

    it('filters to inactive scholarships when active="false"', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({ active: 'false' });

      expect(qb.andWhere).toHaveBeenCalledWith('scholarship.is_active = false');
    });

    it('orders by amount DESC when high_amount=true (takes priority over other ordering)', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({ high_amount: 'true', open_application: 'true' });

      expect(qb.orderBy).toHaveBeenCalledWith('scholarship.amount', 'DESC');
    });

    it('orders by application deadline ASC when open_application=true and high_amount is not set', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({ open_application: 'true' });

      expect(qb.orderBy).toHaveBeenCalledWith('scholarship.applicationDeadline', 'ASC');
    });

    it('defaults to ordering by createdAt DESC when no special filters are set', async () => {
      const qb = makeQueryBuilderMock();
      repo.createQueryBuilder.mockReturnValue(qb);

      await repository.findAll({});

      expect(qb.orderBy).toHaveBeenCalledWith('scholarship.createdAt', 'DESC');
    });
  });

  describe('update', () => {
    it('returns null without saving when the scholarship does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await repository.update('missing', { name: 'Updated' } as any);

      expect(result).toBeNull();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('merges the dto onto the existing entity and saves it', async () => {
      const existing = { id: 'scholarship-1', name: 'Old name' };
      repo.findOne.mockResolvedValue(existing);
      repo.merge.mockReturnValue({ id: 'scholarship-1', name: 'New name' });
      repo.save.mockResolvedValue({ id: 'scholarship-1', name: 'New name' });

      const result = await repository.update('scholarship-1', { name: 'New name' } as any);

      expect(repo.merge).toHaveBeenCalledWith(existing, { name: 'New name' });
      expect(result).toEqual({ id: 'scholarship-1', name: 'New name' });
    });
  });
});
