import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationGateway } from './gateways/notification-gateway.interface.js';
import { GATEWAY_TOKEN } from './gateways/gateway.token.js';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_TOKEN) private readonly gateway: NotificationGateway,
  ) {}

  async sendWelcomeSms(mobile: string, memberId: string): Promise<void> {
    this.logger.log(`Sending welcome SMS to ${mobile} for member ${memberId}.`);
    const message = `Welcome to Shree Crystal Cooperative Society, member ${memberId}!`;
    await this.gateway.sendSms(mobile, message).catch((err) => {
      this.logger.error(`Failed to send welcome SMS to ${mobile}: ${err.message}`);
    });
  }

  async sendWelcomeEmail(email: string, memberId: string): Promise<void> {
    this.logger.log(`Sending welcome email to ${email} for member ${memberId}.`);
    const body = `Welcome to Shree Crystal Cooperative Society, member ${memberId}!\nWe are glad to have you.`;
    await this.gateway.sendEmail(email, 'Welcome to Shree Crystal', body).catch((err) => {
      this.logger.error(`Failed to send welcome Email to ${email}: ${err.message}`);
    });
  }

  async sendStatementPublishedNotification(memberId: string, period: string): Promise<void> {
    this.logger.log(
      `Sending statement published notification to member ${memberId} for period ${period}.`,
    );

    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.mobile) {
      await this.gateway
        .sendSms(member.mobile, `Your statement for ${period} has been published.`)
        .catch((err) => {
          this.logger.error(`Failed to send statement SMS to ${member.mobile}: ${err.message}`);
        });
    }
  }

  async sendQueryReplyNotification(memberId: string, queryId: string): Promise<void> {
    this.logger.log(`Sending query reply notification to member ${memberId} for query ${queryId}.`);
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.email) {
      await this.gateway
        .sendEmail(
          member.email,
          `Update on your query ${queryId}`,
          `A new reply was posted on your query ${queryId}.`,
        )
        .catch((err) => {
          this.logger.error(`Failed to send query email to ${member.email}: ${err.message}`);
        });
    }
  }

  async sendQueryStatusChangeNotification(
    memberId: string,
    queryId: string,
    newStatus: string,
  ): Promise<void> {
    this.logger.log(
      `Sending query status change notification to member ${memberId} for query ${queryId}. New status: ${newStatus}.`,
    );
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) return;

    if (member.email) {
      await this.gateway
        .sendEmail(
          member.email,
          `Status updated for query ${queryId}`,
          `Your query is now marked as ${newStatus}.`,
        )
        .catch((err) => {
          this.logger.error(`Failed to send query status email to ${member.email}: ${err.message}`);
        });
    }
  }
}
