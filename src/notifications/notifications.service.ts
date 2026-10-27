import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async sendWelcomeSms(mobile: string, memberId: string): Promise<void> {
    this.logger.log(`Sending welcome SMS to ${mobile} for member ${memberId}.`);
    const message = `Welcome to Shree Crystal Cooperative Society, member ${memberId}!`;
    await this.sendSms(mobile, message).catch((err) => {
      this.logger.error(`Failed to send welcome SMS to ${mobile}: ${err.message}`);
    });
  }

  async sendWelcomeEmail(email: string, memberId: string): Promise<void> {
    this.logger.log(`Sending welcome email to ${email} for member ${memberId}.`);
    const body = `Welcome to Shree Crystal Cooperative Society, member ${memberId}!\nWe are glad to have you.`;
    await this.sendEmail(email, 'Welcome to Shree Crystal', body).catch((err) => {
      this.logger.error(`Failed to send welcome Email to ${email}: ${err.message}`);
    });
  }

  async sendStatementPublishedNotification(memberId: string, period: string): Promise<void> {
    this.logger.log(
      `Sending statement published notification to member ${memberId} for period ${period}.`,
    );

    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.mobileNumber) {
      await this.sendSms(
        member.mobileNumber,
        `Your statement for ${period} has been published.`,
      ).catch((err) => {
        this.logger.error(`Failed to send statement SMS to ${member.mobileNumber}: ${err.message}`);
      });
    }
  }

  async sendTicketReplyNotification(memberId: string, ticketId: string): Promise<void> {
    this.logger.log(
      `Sending ticket reply notification to member ${memberId} for ticket ${ticketId}.`,
    );
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.email) {
      await this.sendEmail(
        member.email,
        `Update on your ticket ${ticketId}`,
        `A new reply was posted on your ticket ${ticketId}.`,
      ).catch((err) => {
        this.logger.error(`Failed to send ticket email to ${member.email}: ${err.message}`);
      });
    }
  }

  async sendTicketStatusChangeNotification(
    memberId: string,
    ticketId: string,
    newStatus: string,
  ): Promise<void> {
    this.logger.log(
      `Sending ticket status change notification to member ${memberId} for ticket ${ticketId}. New status: ${newStatus}.`,
    );
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.email) {
      await this.sendEmail(
        member.email,
        `Status updated for ticket ${ticketId}`,
        `Your ticket is now marked as ${newStatus}.`,
      ).catch((err) => {
        this.logger.error(`Failed to send ticket status email to ${member.email}: ${err.message}`);
      });
    }
  }

  async sendSms(to: string, message: string, overrideApiKey?: string): Promise<boolean> {
    return this.withRetry(async () => {
      const apiKey =
        overrideApiKey ||
        (await this.settingsService.getSetting<string>('notification.sms.apiKey'));

      if (!apiKey) {
        this.logger.warn(`Cannot send SMS to ${to}: SMS API key not configured.`);
        return false;
      }

      // No SMS provider is integrated yet. Report failure rather than pretend the message
      // left the server: callers record the delivery as FAILED, which is the truth.
      this.logger.warn(
        `SMS not sent (message length ${message.length}): no SMS provider is integrated.`,
      );
      return false;
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

      this.logger.log(`[Email] Sending Email to ${to} with subject "${subject}"`);

      try {
        const transporter = nodemailer.createTransport(smtpUrl);
        await transporter.sendMail({
          from: fromEmail,
          to,
          subject,
          text: body,
        });

        return true;
      } catch (error: any) {
        throw new Error(`SMTP Provider Error: ${error.message}`);
      }
    }, `sendEmail to ${to}`);
  }

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
