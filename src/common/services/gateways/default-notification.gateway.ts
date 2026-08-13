import { Injectable, Logger } from '@nestjs/common';
import { NotificationGateway } from './notification-gateway.interface.js';
import { SettingsService } from '../../../settings/settings.service.js';
import * as nodemailer from 'nodemailer';

@Injectable()
export class DefaultNotificationGateway implements NotificationGateway {
  private readonly logger = new Logger(DefaultNotificationGateway.name);
  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(private readonly settingsService: SettingsService) {}

  async sendSms(to: string, message: string, overrideApiKey?: string): Promise<boolean> {
    return this.withRetry(async () => {
      const apiKey =
        overrideApiKey ||
        (await this.settingsService.getSetting<string>('notification.sms.apiKey'));

      if (!apiKey) {
        this.logger.warn(`Cannot send SMS to ${to}: SMS API key not configured.`);
        return false;
      }

      // Here we simulate an external HTTP call to a generic SMS provider (e.g. Twilio/MSG91 REST API)
      this.logger.log(`[SMS Gateway] Sending SMS to ${to} (Message length: ${message.length})`);

      try {
        // Simulate a real fetch call
        // const response = await fetch(`https://api.smsprovider.com/v1/messages`, {
        //   method: 'POST',
        //   headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ to, body: message })
        // });
        // if (!response.ok) throw new Error(`Gateway returned ${response.status}`);

        // For demonstration, let's just log and consider it successful unless it's a specific mock failure trigger
        if (to === '+0000000000' || to === 'invalid') {
          throw new Error('Invalid mobile number simulated from provider');
        }

        return true;
      } catch (error: any) {
        throw new Error(`SMS Provider Error: ${error.message}`);
      }
    }, `sendSms to ${to}`);
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    overrideSmtpUrl?: string,
  ): Promise<boolean> {
    return this.withRetry(async () => {
      const smtpUrl =
        overrideSmtpUrl ||
        (await this.settingsService.getSetting<string>('notification.email.smtpUrl'));
      const fromEmail =
        (await this.settingsService.getSetting<string>('notification.email.from')) ||
        'noreply@example.com';

      if (!smtpUrl) {
        this.logger.warn(`Cannot send Email to ${to}: SMTP URL not configured.`);
        return false;
      }

      this.logger.log(`[Email Gateway] Sending Email to ${to} with subject "${subject}"`);

      try {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: fromEmail,
          to,
          subject,
          text: body, // sending as plain text
        });

        return true;
      } catch (error: any) {
        throw new Error(`SMTP Provider Error: ${error.message}`);
      }
    }, `sendEmail to ${to}`);
  }

  /**
   * Wrapper to provide lightweight retry for transient gateway failures.
   */
  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    while (attempt <= this.MAX_RETRIES) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        if (attempt > this.MAX_RETRIES) {
          this.logger.error(
            `[Gateway Failure] ${context} failed permanently after ${attempt} attempts: ${error.message}`,
          );
          throw error;
        }
        this.logger.warn(
          `[Gateway Transient Failure] ${context} failed on attempt ${attempt}. Retrying in ${this.RETRY_DELAY_MS}ms... (${error.message})`,
        );
        await this.delay(this.RETRY_DELAY_MS);
      }
    }
    throw new Error('Unreachable');
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
