import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingsService } from '../settings.service.js';
import { ModuleRef } from '@nestjs/core';
import { NotificationGateway } from '../../common/services/gateways/notification-gateway.interface.js';
import { GATEWAY_TOKEN } from '../../common/services/gateways/gateway.token.js';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledBackup() {
    this.logger.log('Starting scheduled backup...');
    await this.runBackup();
  }

  async runBackup(): Promise<void> {
    try {
      this.logger.log('Executing database dump and upload...');
      await this.settingsService.updateBackupStatus({
        lastBackupTimestamp: new Date(),
        status: 'IN_PROGRESS',
      });

      // Simulate backup process
      await this.performBackupTask();

      await this.settingsService.updateBackupStatus({
        lastBackupTimestamp: new Date(),
        status: 'SUCCESS',
      });
      this.logger.log('Backup completed successfully.');
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error.stack);

      await this.settingsService.updateBackupStatus({
        lastBackupTimestamp: new Date(),
        status: 'FAILED',
      });

      await this.notifySuperAdminOfFailure(error.message);

      throw error;
    }
  }

  // Method specifically isolated to be mockable in tests
  protected async performBackupTask(): Promise<void> {
    // In a real scenario, this would run pg_dump and upload to S3
    // For now, it just resolves. We can mock this to throw in tests.
    return Promise.resolve();
  }

  private async notifySuperAdminOfFailure(errorMessage: string) {
    try {
      // Use strict: false because NotificationGateway is provided elsewhere
      const gateway = this.moduleRef.get<NotificationGateway>(GATEWAY_TOKEN, { strict: false });

      const adminEmail =
        (await this.settingsService.getSetting<string>('admin.superAdminEmail')) ||
        'superadmin@shree-crystal.com';
      const adminPhone =
        (await this.settingsService.getSetting<string>('admin.superAdminPhone')) || '+1234567890';

      const message = `CRITICAL: Database backup failed. Error: ${errorMessage}`;

      this.logger.log('Notifying Super Admin about backup failure...');

      // We try both SMS and Email just in case one fails
      await gateway
        .sendEmail(adminEmail, 'Database Backup Failed', message)
        .catch((e) => this.logger.error('Failed to send failure email', e));

      await gateway
        .sendSms(adminPhone, message)
        .catch((e) => this.logger.error('Failed to send failure SMS', e));
    } catch (notifyError) {
      this.logger.error(
        'Failed to retrieve notification gateway for backup failure notification',
        notifyError,
      );
    }
  }
}
