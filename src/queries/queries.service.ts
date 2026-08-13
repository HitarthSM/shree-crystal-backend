import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationService } from '../common/services/notification.service.js';
import { CreateQueryDto } from './dto/create-query.dto.js';
import { AddMessageDto } from './dto/add-message.dto.js';
import { AdminReplyDto } from './dto/admin-reply.dto.js';
import { QueryFilterDto } from './dto/query-filter.dto.js';
import { SenderType, QueryStatus } from '@prisma/client';

@Injectable()
export class QueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── MEMBER METHODS ────────────────────────────────────────────────────────

  async createMemberQuery(memberId: string, dto: CreateQueryDto) {
    return this.prisma.supportQuery.create({
      data: {
        memberId,
        subject: dto.subject,
        status: QueryStatus.OPEN,
        messages: {
          create: {
            senderType: SenderType.MEMBER,
            senderId: memberId,
            message: dto.message,
            attachmentUrl: dto.attachmentUrl,
          },
        },
      },
      include: {
        messages: true,
      },
    });
  }

  async getMemberQueries(memberId: string) {
    return this.prisma.supportQuery.findMany({
      where: { memberId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  async getMemberQueryById(memberId: string, queryId: string) {
    const query = await this.prisma.supportQuery.findUnique({
      where: { id: queryId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!query) {
      throw new NotFoundException('Query not found');
    }

    if (query.memberId !== memberId) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return query;
  }

  async reopenMemberQuery(memberId: string, queryId: string) {
    const query = await this.getMemberQueryById(memberId, queryId);

    if (query.status !== QueryStatus.RESOLVED) {
      throw new BadRequestException('Only RESOLVED queries can be reopened');
    }

    return this.prisma.supportQuery.update({
      where: { id: queryId },
      data: {
        status: QueryStatus.OPEN,
        resolvedAt: null,
      },
    });
  }

  async addMemberMessage(memberId: string, queryId: string, dto: AddMessageDto) {
    const query = await this.getMemberQueryById(memberId, queryId);

    if (query.status === QueryStatus.RESOLVED) {
      throw new BadRequestException(
        'Cannot add a message to a RESOLVED query. Please reopen it first.',
      );
    }

    const newMessage = await this.prisma.queryMessage.create({
      data: {
        queryId,
        senderType: SenderType.MEMBER,
        senderId: memberId,
        message: dto.message,
        attachmentUrl: dto.attachmentUrl,
      },
    });

    // Update the parent query's updatedAt timestamp
    await this.prisma.supportQuery.update({
      where: { id: queryId },
      data: { updatedAt: new Date() },
    });

    return newMessage;
  }

  // ─── ADMIN METHODS ─────────────────────────────────────────────────────────

  async getAdminQueries(filterDto: QueryFilterDto) {
    const { status } = filterDto;
    return this.prisma.supportQuery.findMany({
      where: {
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        member: {
          select: { fullName: true, memberId: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  async addAdminReply(adminId: string, queryId: string, dto: AdminReplyDto) {
    const query = await this.prisma.supportQuery.findUnique({
      where: { id: queryId },
    });

    if (!query) {
      throw new NotFoundException('Query not found');
    }

    // Wrap in a transaction to safely update both message and query status
    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.queryMessage.create({
        data: {
          queryId,
          senderType: SenderType.ADMIN,
          senderId: adminId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrl,
        },
      });

      const updateData: any = { updatedAt: new Date() };
      let statusChanged = false;

      if (dto.status && dto.status !== query.status) {
        updateData.status = dto.status;
        statusChanged = true;
        if (dto.status === QueryStatus.RESOLVED) {
          updateData.resolvedAt = new Date();
        } else if (query.status === QueryStatus.RESOLVED) {
          updateData.resolvedAt = null; // Reopening
        }
      }

      await tx.supportQuery.update({
        where: { id: queryId },
        data: updateData,
      });

      return { message, statusChanged, newStatus: dto.status };
    });

    // Fire notifications asynchronously
    this.notificationService.sendQueryReplyNotification(query.memberId, queryId).catch((err) => {
      console.error('Failed to send query reply notification:', err);
    });

    if (result.statusChanged && result.newStatus) {
      this.notificationService
        .sendQueryStatusChangeNotification(query.memberId, queryId, result.newStatus)
        .catch((err) => {
          console.error('Failed to send query status change notification:', err);
        });
    }

    return result.message;
  }
}
