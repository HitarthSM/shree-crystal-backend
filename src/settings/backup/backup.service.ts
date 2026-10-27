import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingsService } from '../settings.service.js';
import { ModuleRef } from '@nestjs/core';
import { NotificationsService } from '../../notifications/notifications.service.js';

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
    try {
      await this.runBackup();
    } catch {
      // runBackup has already logged, recorded FAILED and notified; the scheduler must not crash.
    }
  }

  async runBackup(): Promise<void> {
    try {
      this.logger.log('Executing database dump and upload...');
      await this.settingsService.updateBackupStatus({
        lastBackupTimestamp: new Date(),
        status: 'IN_PROGRESS',
      });

      await this.performBackupTask();

      await this.settingsService.updateBackupStatus({
        lastBackupTimestamp: new Date(),
        status: 'SUCCESS',
      });
      this.logger.log('Backup completed successfully.');
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error.stack);

      await this.settingsService
        .updateBackupStatus({ lastBackupTimestamp: new Date(), status: 'FAILED' })
        .catch((statusError: unknown) =>
          this.logger.error('Could not record the failed backup status', statusError),
        );

      await this.notifySuperAdminOfFailure(error.message);

      throw error;
    }
  }

  // Method specifically isolated to be mockable in tests
  protected performBackupTask(): Promise<void> {
    // No backup destination or dump job exists yet. Throwing keeps the recorded status truthful:
    // reporting SUCCESS for a backup that never ran would give false assurance.
    return Promise.reject(
      new Error('Backups are not configured: no destination or dump job is set up.'),
    );
  }

  private async notifySuperAdminOfFailure(errorMessage: string) {
    try {
      // Use strict: false because NotificationsService is provided elsewhere
      const gateway = this.moduleRef.get(NotificationsService, { strict: false });

      const adminEmail = await this.settingsService.getSetting<string>('admin.superAdminEmail');
      const adminPhone = await this.settingsService.getSetting<string>('admin.superAdminPhone');
      if (!adminEmail && !adminPhone) {
        this.logger.warn('No Super Admin contact is configured; backup failure was not notified.');
        return;
      }

      const message = `CRITICAL: Database backup failed. Error: ${errorMessage}`;

      this.logger.log('Notifying Super Admin about backup failure...');

      // We try both SMS and Email just in case one fails
      if (adminEmail) {
        await gateway
          .sendEmail(adminEmail, 'Database Backup Failed', message)
          .catch((e) => this.logger.error('Failed to send failure email', e));
      }
      if (adminPhone) {
        await gateway
          .sendSms(adminPhone, message)
          .catch((e) => this.logger.error('Failed to send failure SMS', e));
      }
    } catch (notifyError) {
      this.logger.error(
        'Failed to retrieve notification gateway for backup failure notification',
        notifyError,
      );
    }
  }
}
