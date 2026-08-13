import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { BackupService } from './backup/backup.service.js';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, BackupService],
  exports: [SettingsService, BackupService],
})
export class SettingsModule {}
