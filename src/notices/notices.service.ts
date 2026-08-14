import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationService } from '../common/services/notification.service.js';
import { DeliveryStatus } from '@prisma/client';

@Injectable()
export class NoticesService {
  private readonly logger = new Logger(NoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationService,
  ) {}

  async create(dto: any) {
    const notice = await this.prisma.notice.create({
      data: {
        title: dto.title,
        body: dto.body,
        category: dto.category || 'GENERAL',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        attachmentUrl: dto.attachmentUrl,
        isActive: true,
      },
    });

    // Automatically enqueue deliveries for all active members (based on Phase 3 implementation plan)
    const activeMembers = await this.prisma.member.findMany({
      where: { status: 'ACTIVE' },
    });

    if (activeMembers.length > 0) {
      const deliveries = activeMembers.map((member) => ({
        noticeId: notice.id,
        memberId: member.id,
        channel: member.mobile ? 'SMS' : 'EMAIL',
      })) as any[];

      await this.prisma.noticeDelivery.createMany({
        data: deliveries,
        skipDuplicates: true,
      });

      // Fire and forget dispatch (in background)
      this.dispatchNotice(notice.id).catch((err) =>
        this.logger.error(`Background dispatch failed for notice ${notice.id}`, err),
      );
    }

    return notice;
  }

  async findAll(page = 1, limit = 10, category?: string) {
    const skip = (page - 1) * limit;
    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }

    const [data, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notice.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMemberNotices(memberId: string) {
    const deliveries = await this.prisma.noticeDelivery.findMany({
      where: {
        memberId,
        notice: { isActive: true },
      },
      include: { notice: true },
      orderBy: { notice: { createdAt: 'desc' } },
    });

    return deliveries;
  }

  async update(id: string, dto: any) {
    return this.prisma.notice.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        category: dto.category,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        attachmentUrl: dto.attachmentUrl,
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.notice.update({
      where: { id },
      data: { isActive: false },
    });
  }

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
