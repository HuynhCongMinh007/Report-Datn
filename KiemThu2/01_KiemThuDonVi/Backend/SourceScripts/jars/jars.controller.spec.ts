import { HttpStatus } from '@nestjs/common';
import { JarsController } from './jars.controller';
import { JARS_CONST } from './constants/jars.constant';

describe('JarsController', () => {
  let controller: JarsController;

  const jarsService = {
    getJars: jest.fn(),
    getJarAllocations: jest.fn(),
    updateJarAllocations: jest.fn(),
    getJarTags: jest.fn(),
    createJarTag: jest.fn(),
    updateJarTag: jest.fn(),
    deleteJarTag: jest.fn(),
    getJarDetail: jest.fn(),
    createJar: jest.fn(),
    updateJar: jest.fn(),
    deleteUserJar: jest.fn(),
    updateJarPercentages: jest.fn(),
    getJarTransactions: jest.fn(),
    getJarStatistics: jest.fn(),
    getJarChartData: jest.fn(),
    getJarNotificationSetting: jest.fn(),
    updateJarNotificationSetting: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new JarsController(jarsService as any);
  });

  it('getJars delegates to service.getJars with userId and query dto', async () => {
    jarsService.getJars.mockResolvedValue([{ id: 'jar-1' }]);
    const dto = { code: 'essentials' } as any;

    const result = await controller.getJars(dto, 'user-1');

    expect(jarsService.getJars).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.GET_JARS_SUCCESS, code: HttpStatus.OK, data: [{ id: 'jar-1' }] });
  });

  it('getJarAllocations delegates to service.getJarAllocations with userId', async () => {
    jarsService.getJarAllocations.mockResolvedValue([{ jarId: 'jar-1', percentage: 55 }]);

    const result = await controller.getJarAllocations('user-1');

    expect(jarsService.getJarAllocations).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_ALLOCATIONS_SUCCESS });
  });

  it('updateJarAllocations delegates to service.updateJarAllocations with userId and body', async () => {
    const dto = { allocations: [] } as any;
    jarsService.updateJarAllocations.mockResolvedValue([]);

    const result = await controller.updateJarAllocations(dto, 'user-1');

    expect(jarsService.updateJarAllocations).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.UPDATE_ALLOCATIONS_SUCCESS });
  });

  it('getJarTags delegates to service.getJarTags with jar id and userId', async () => {
    jarsService.getJarTags.mockResolvedValue([{ id: 'tag-1' }]);

    const result = await controller.getJarTags('jar-1', 'user-1');

    expect(jarsService.getJarTags).toHaveBeenCalledWith('user-1', 'jar-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_TAGS_SUCCESS });
  });

  it('createJarTag delegates to service.createJarTag and returns 201', async () => {
    const dto = { name: 'ăn vặt' } as any;
    jarsService.createJarTag.mockResolvedValue({ id: 'tag-1' });

    const result = await controller.createJarTag('jar-1', dto, 'user-1');

    expect(jarsService.createJarTag).toHaveBeenCalledWith('user-1', 'jar-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.CREATE_JAR_TAG_SUCCESS, code: HttpStatus.CREATED });
  });

  it('updateJarTag delegates to service.updateJarTag with tagId, body and userId', async () => {
    const dto = { name: 'updated' } as any;
    jarsService.updateJarTag.mockResolvedValue({ id: 'tag-1', name: 'updated' });

    const result = await controller.updateJarTag('tag-1', dto, 'user-1');

    expect(jarsService.updateJarTag).toHaveBeenCalledWith('user-1', 'tag-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.UPDATE_JAR_TAG_SUCCESS });
  });

  it('deleteJarTag delegates to service.deleteJarTag with tagId and userId', async () => {
    jarsService.deleteJarTag.mockResolvedValue(undefined);

    const result = await controller.deleteJarTag('tag-1', 'user-1');

    expect(jarsService.deleteJarTag).toHaveBeenCalledWith('user-1', 'tag-1');
    expect(result).toMatchObject({ message: JARS_CONST.DELETE_JAR_TAG_SUCCESS });
  });

  it('getJarDetail delegates to service.getJarDetail with userId and id param', async () => {
    jarsService.getJarDetail.mockResolvedValue({ id: 'jar-1' });

    const result = await controller.getJarDetail({ id: 'jar-1' } as any, 'user-1');

    expect(jarsService.getJarDetail).toHaveBeenCalledWith('user-1', 'jar-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_DETAIL_SUCCESS });
  });

  it('createJar delegates to service.createJar and returns 201', async () => {
    const dto = { name: 'Du lịch' } as any;
    jarsService.createJar.mockResolvedValue({ id: 'jar-new' });

    const result = await controller.createJar(dto, 'user-1');

    expect(jarsService.createJar).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.CREATE_JAR_SUCCESS, code: HttpStatus.CREATED });
  });

  it('updateJar delegates to service.updateJar with id, body and userId', async () => {
    const dto = { name: 'Updated' } as any;
    jarsService.updateJar.mockResolvedValue({ id: 'jar-1', name: 'Updated' });

    const result = await controller.updateJar({ id: 'jar-1' } as any, dto, 'user-1');

    expect(jarsService.updateJar).toHaveBeenCalledWith('user-1', 'jar-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.UPDATE_JAR_SUCCESS });
  });

  it('deleteJar delegates to service.deleteUserJar with id, transferToJarId and userId', async () => {
    jarsService.deleteUserJar.mockResolvedValue(undefined);

    const result = await controller.deleteJar(
      { id: 'jar-1' } as any,
      { transferToJarId: 'jar-2' } as any,
      'user-1',
    );

    expect(jarsService.deleteUserJar).toHaveBeenCalledWith('user-1', 'jar-1', 'jar-2');
    expect(result).toMatchObject({ message: JARS_CONST.DELETE_JAR_SUCCESS });
  });

  it('updateJarPercentages delegates to service.updateJarPercentages with userId and body', async () => {
    const dto = { percentages: [] } as any;
    jarsService.updateJarPercentages.mockResolvedValue(undefined);

    const result = await controller.updateJarPercentages(dto, 'user-1');

    expect(jarsService.updateJarPercentages).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.UPDATE_PERCENTAGES_SUCCESS });
  });

  it('getJarTransactions delegates to service.getJarTransactions with id, query and userId', async () => {
    jarsService.getJarTransactions.mockResolvedValue({ data: [], meta: {} });
    const queryDto = { page: 1, limit: 20 } as any;

    const result = await controller.getJarTransactions({ id: 'jar-1' } as any, queryDto, 'user-1');

    expect(jarsService.getJarTransactions).toHaveBeenCalledWith('user-1', 'jar-1', queryDto);
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_TRANSACTIONS_SUCCESS });
  });

  it('getJarStatistics delegates to service.getJarStatistics with userId and id', async () => {
    jarsService.getJarStatistics.mockResolvedValue({ id: 'jar-1' });

    const result = await controller.getJarStatistics({ id: 'jar-1' } as any, 'user-1');

    expect(jarsService.getJarStatistics).toHaveBeenCalledWith('user-1', 'jar-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_STATISTICS_SUCCESS });
  });

  it('getJarChartData delegates to service.getJarChartData with userId and id', async () => {
    jarsService.getJarChartData.mockResolvedValue({ id: 'jar-1' });

    const result = await controller.getJarChartData({ id: 'jar-1' } as any, 'user-1');

    expect(jarsService.getJarChartData).toHaveBeenCalledWith('user-1', 'jar-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_CHART_DATA_SUCCESS });
  });

  it('getJarNotificationSetting delegates to service.getJarNotificationSetting with userId and id', async () => {
    jarsService.getJarNotificationSetting.mockResolvedValue({ id: 'notif-1' });

    const result = await controller.getJarNotificationSetting('jar-1', 'user-1');

    expect(jarsService.getJarNotificationSetting).toHaveBeenCalledWith('user-1', 'jar-1');
    expect(result).toMatchObject({ message: JARS_CONST.GET_JAR_NOTIFICATION_SETTINGS_SUCCESS });
  });

  it('updateJarNotificationSetting delegates to service.updateJarNotificationSetting with id, body and userId', async () => {
    const dto = { percentEnabled: true } as any;
    jarsService.updateJarNotificationSetting.mockResolvedValue({ id: 'notif-1' });

    const result = await controller.updateJarNotificationSetting('jar-1', dto, 'user-1');

    expect(jarsService.updateJarNotificationSetting).toHaveBeenCalledWith('user-1', 'jar-1', dto);
    expect(result).toMatchObject({ message: JARS_CONST.UPDATE_JAR_NOTIFICATION_SETTINGS_SUCCESS });
  });
});
