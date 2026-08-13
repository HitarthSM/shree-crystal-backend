import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { NotificationGateway } from '../common/services/gateways/notification-gateway.interface.js';
import { GATEWAY_TOKEN } from '../common/services/gateways/gateway.token.js';
import { DeliveryStatus } from '@prisma/client';

@Injectable()
export class NoticesService {
  private readonly logger = new Logger(NoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_TOKEN) private readonly gateway: NotificationGateway,
  ) {}

  /**
   * Dispatches pending notice deliveries for a given notice ID.
   * Uses a loop with try/catch to ensure one failed recipient doesn't fail the batch.
   */
  async dispatchNotice(noticeId: string): Promise<void> {
    const deliveries = await this.prisma.noticeDelivery.findMany({
      where: {
        noticeId,
        status: DeliveryStatus.PENDING,
      },
      include: {
        member: true,
      },
    });

    if (deliveries.length === 0) {
      this.logger.log(`No pending deliveries for notice ${noticeId}`);
      return;
    }

    this.logger.log(
      `Starting dispatch for notice ${noticeId} to ${deliveries.length} recipients...`,
    );

    for (const delivery of deliveries) {
      try {
        let success = false;

        // In a real app we'd fetch the message body from Notice or pass it in.
        // For simplicity, we use a placeholder message body.
        const message = `Notice from Shree Crystal Cooperative Society. Please check your dashboard for details.`;

        if (delivery.channel === 'SMS' && delivery.member.mobile) {
          success = await this.gateway.sendSms(delivery.member.mobile, message);
        } else if (delivery.channel === 'EMAIL' && delivery.member.email) {
          success = await this.gateway.sendEmail(delivery.member.email, 'Society Notice', message);
        } else {
          throw new Error('Member missing contact info for the requested channel');
        }

        if (success) {
          await this.prisma.noticeDelivery.update({
            where: { id: delivery.id },
            data: {
              status: DeliveryStatus.SENT,
              sentAt: new Date(),
            },
          });
          this.logger.log(
            `Successfully delivered notice to member ${delivery.member.memberId} via ${delivery.channel}`,
          );
        } else {
          throw new Error('Gateway returned false');
        }
      } catch (error: any) {
        this.logger.error(
          `Failed delivery for notice ${noticeId} to member ${delivery.member.memberId}: ${error.message}`,
        );
        await this.prisma.noticeDelivery.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.FAILED,
            errorMsg: error.message,
          },
        });
      }
    }

    this.logger.log(`Completed dispatch batch for notice ${noticeId}`);
  }
}
