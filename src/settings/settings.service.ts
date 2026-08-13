import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ModuleRef } from '@nestjs/core';
import { NotificationGateway } from '../common/services/gateways/notification-gateway.interface.js';
import { GATEWAY_TOKEN } from '../common/services/gateways/gateway.token.js';
import { SocietyDetailsDto } from './dto/society-details.dto.js';
import {
  NotificationGatewayDto,
  NotificationGatewayResponseDto,
} from './dto/notification-gateway.dto.js';
import { SecurityPolicyDto } from './dto/security-policy.dto.js';
import { BackupStatusDto } from './dto/backup-status.dto.js';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getSetting<T = any>(key: string): Promise<T | null> {
    const setting = await this.prisma.settings.findUnique({
      where: { key },
    });
    if (setting) {
      return setting.value as unknown as T;
    }

    // Fallback to env vars for specific gateway credentials
    switch (key) {
      case 'notification.sms.apiKey':
        return process.env.SMS_API_KEY as unknown as T;
      case 'notification.email.smtpUrl':
        return process.env.SMTP_URL as unknown as T;
      case 'notification.email.from':
        return (process.env.SMTP_FROM || 'noreply@shree-crystal.com') as unknown as T;
    }

    return null;
  }

  async updateSetting(key: string, value: any, adminId?: string): Promise<void> {
    // If it's a gateway credential, test it first
    if (key === 'notification.sms.apiKey' && value) {
      const gateway = this.moduleRef.get<NotificationGateway>(GATEWAY_TOKEN, { strict: false });
      const testPhone =
        (await this.getSetting<string>('notification.sms.testNumber')) || '+1234567890';
      this.logger.log(`Testing new SMS API key by sending a test message to ${testPhone}`);
      const success = await gateway.sendSms(
        testPhone,
        'Test message to verify gateway configuration.',
        value,
      );
      if (!success) {
        throw new Error('Failed to verify SMS API key. Test message failed.');
      }
    }

    if (key === 'notification.email.smtpUrl' && value) {
      const gateway = this.moduleRef.get<NotificationGateway>(GATEWAY_TOKEN, { strict: false });
      const testEmail =
        (await this.getSetting<string>('notification.email.testEmail')) || 'test@example.com';
      this.logger.log(`Testing new SMTP URL by sending a test email to ${testEmail}`);
      const success = await gateway.sendEmail(
        testEmail,
        'Test SMTP Config',
        'This is a test email to verify SMTP configuration.',
        value,
      );
      if (!success) {
        throw new Error('Failed to verify SMTP URL. Test email failed.');
      }
    }

    await this.prisma.settings.upsert({
      where: { key },
      update: {
        value: value === undefined ? null : value, // allow nulling out
        updatedById: adminId,
      },
      create: {
        key,
        value: value === undefined ? null : value,
        updatedById: adminId,
      },
    });

    this.logger.log(`Updated setting ${key}`);
  }

  // --- Typed Setting Helpers ---

  async getSocietyDetails(): Promise<SocietyDetailsDto | null> {
    return this.getSetting<SocietyDetailsDto>('society.details');
  }

  async updateSocietyDetails(dto: SocietyDetailsDto, adminId?: string): Promise<void> {
    await this.updateSetting('society.details', dto, adminId);
  }

  async getNotificationGatewayConfig(): Promise<NotificationGatewayResponseDto> {
    const smsApiKey = await this.getSetting<string>('notification.sms.apiKey');
    const smtpUrl = await this.getSetting<string>('notification.email.smtpUrl');
    const smtpFrom = await this.getSetting<string>('notification.email.from');

    return {
      smsApiKeyConfigured: !!smsApiKey,
      smtpUrlConfigured: !!smtpUrl,
      smtpFrom: smtpFrom ?? undefined,
    };
  }

  async updateNotificationGateway(dto: NotificationGatewayDto, adminId?: string): Promise<void> {
    if (dto.smsApiKey !== undefined) {
      await this.updateSetting('notification.sms.apiKey', dto.smsApiKey, adminId);
    }
    if (dto.smtpUrl !== undefined) {
      await this.updateSetting('notification.email.smtpUrl', dto.smtpUrl, adminId);
    }
    if (dto.smtpFrom !== undefined) {
      await this.updateSetting('notification.email.from', dto.smtpFrom, adminId);
    }
  }

  async getSecurityPolicy(): Promise<SecurityPolicyDto | null> {
    return this.getSetting<SecurityPolicyDto>('security.policy');
  }

  async updateSecurityPolicy(dto: SecurityPolicyDto, adminId?: string): Promise<void> {
    await this.updateSetting('security.policy', dto, adminId);
  }

  async getBackupStatus(): Promise<BackupStatusDto | null> {
    return this.getSetting<BackupStatusDto>('backup.status');
  }

  async updateBackupStatus(dto: BackupStatusDto, adminId?: string): Promise<void> {
    await this.updateSetting('backup.status', dto, adminId);
  }
}
