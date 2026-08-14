import { Test, TestingModule } from '@nestjs/testing';
import { BackupService } from './backup.service.js';
import { SettingsService } from '../settings.service.js';
import { ModuleRef } from '@nestjs/core';
import { NotificationService } from '../../common/services/notification.service.js';

describe('BackupService', () => {
  let service: BackupService;
  let settingsService: jest.Mocked<SettingsService>;
  let moduleRef: jest.Mocked<ModuleRef>;
  let mockGateway: any;

  beforeEach(async () => {
    mockGateway = {
      sendSms: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    const mockSettingsService = {
      updateBackupStatus: jest.fn().mockResolvedValue(undefined),
      getSetting: jest.fn().mockImplementation((key) => {
        if (key === 'admin.superAdminEmail') return Promise.resolve('test@test.com');
        if (key === 'admin.superAdminPhone') return Promise.resolve('+1111111111');
        return Promise.resolve(null);
      }),
    };

    const mockModuleRef = {
      get: jest.fn().mockReturnValue(mockGateway),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    settingsService = module.get(SettingsService);
    moduleRef = module.get(ModuleRef);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runBackup', () => {
    it('should successfully run backup and update status', async () => {
      // Mock performBackupTask to succeed
      jest.spyOn(service as any, 'performBackupTask').mockResolvedValue(undefined);

      await service.runBackup();

      expect(settingsService.updateBackupStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
      expect(settingsService.updateBackupStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS' }),
      );
      expect(mockGateway.sendEmail).not.toHaveBeenCalled();
      expect(mockGateway.sendSms).not.toHaveBeenCalled();
    });

    it('should trigger a notification call when backup attempt fails', async () => {
      // Mock performBackupTask to fail
      const mockError = new Error('Storage failed');
      jest.spyOn(service as any, 'performBackupTask').mockRejectedValue(mockError);

      await expect(service.runBackup()).rejects.toThrow('Storage failed');

      expect(settingsService.updateBackupStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
      expect(settingsService.updateBackupStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
      );

      // Verify gateway was fetched
      expect(moduleRef.get).toHaveBeenCalledWith(NotificationService, { strict: false });

      // Verify email and SMS were sent
      expect(mockGateway.sendEmail).toHaveBeenCalledWith(
        'test@test.com',
        'Database Backup Failed',
        expect.stringContaining('Storage failed'),
      );
      expect(mockGateway.sendSms).toHaveBeenCalledWith(
        '+1111111111',
        expect.stringContaining('Storage failed'),
      );
    });
  });
});
