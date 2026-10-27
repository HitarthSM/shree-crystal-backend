import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto.js';
import { AddMessageDto } from './dto/add-message.dto.js';
import { AdminReplyDto } from './dto/admin-reply.dto.js';
import { SupportTicketFilterDto } from './dto/support-ticket-filter.dto.js';
import { StorageService, attachmentOwner } from '../storage/storage.service.js';
import { SenderType, TicketStatus } from '@prisma/client';

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /** A member may only attach files they uploaded themselves. */
  private assertOwnAttachment(memberId: string, attachmentUrl?: string): void {
    if (attachmentUrl && attachmentOwner(attachmentUrl) !== memberId) {
      throw new BadRequestException('Attachment was not uploaded by you');
    }
  }

  private async assertAttachmentExists(attachmentUrl?: string): Promise<void> {
    if (attachmentUrl && !(await this.storage.exists(attachmentUrl))) {
      throw new BadRequestException('Attachment file not found');
    }
  }

  // ─── MEMBER METHODS ────────────────────────────────────────────────────────

  async createMemberTicket(memberId: string, dto: CreateSupportTicketDto) {
    this.assertOwnAttachment(memberId, dto.attachmentUrl);
    await this.assertAttachmentExists(dto.attachmentUrl);
    return this.prisma.supportTicket.create({
      data: {
        memberId,
        subject: dto.subject,
        status: TicketStatus.OPEN,
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

  async getMemberTickets(memberId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { memberId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return tickets.map((q) => {
      const { messages, ...rest } = q;
      return {
        ...rest,
        message: messages[0]?.message ?? '',
      };
    });
  }

  async getMemberTicketById(memberId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (ticket.memberId !== memberId) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return ticket;
  }

  async reopenMemberTicket(memberId: string, ticketId: string) {
    const ticket = await this.getMemberTicketById(memberId, ticketId);

    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new BadRequestException('Only RESOLVED tickets can be reopened');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.OPEN,
        resolvedAt: null,
      },
    });
  }

  async addMemberMessage(memberId: string, ticketId: string, dto: AddMessageDto) {
    this.assertOwnAttachment(memberId, dto.attachmentUrl);
    await this.assertAttachmentExists(dto.attachmentUrl);
    const ticket = await this.getMemberTicketById(memberId, ticketId);

    if (ticket.status === TicketStatus.RESOLVED) {
      throw new BadRequestException(
        'Cannot add a message to a RESOLVED ticket. Please reopen it first.',
      );
    }

    const newMessage = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: ticketId,
        senderType: SenderType.MEMBER,
        senderId: memberId,
        message: dto.message,
        attachmentUrl: dto.attachmentUrl,
      },
    });

    // Update the parent ticket's updatedAt timestamp
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    });

    return newMessage;
  }

  // ─── ADMIN METHODS ─────────────────────────────────────────────────────────

  async getAdminTicketById(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        member: { select: { fullName: true, membershipNumber: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    return ticket;
  }

  async getAdminTickets(filterDto: SupportTicketFilterDto) {
    const { status } = filterDto;
    return this.prisma.supportTicket.findMany({
      where: {
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        member: {
          select: { fullName: true, membershipNumber: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  async addAdminReply(adminId: string, ticketId: string, dto: AdminReplyDto) {
    await this.assertAttachmentExists(dto.attachmentUrl);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    // Wrap in a transaction to safely update both message and ticket status
    const result = await this.prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: ticketId,
          senderType: SenderType.ADMIN,
          senderId: adminId,
          message: dto.message,
          attachmentUrl: dto.attachmentUrl,
        },
      });

      const updateData: any = { updatedAt: new Date() };
      let statusChanged = false;

      if (dto.status && dto.status !== ticket.status) {
        updateData.status = dto.status;
        statusChanged = true;
        if (dto.status === TicketStatus.RESOLVED) {
          updateData.resolvedAt = new Date();
        } else if (ticket.status === TicketStatus.RESOLVED) {
          updateData.resolvedAt = null; // Reopening
        }
      }

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: updateData,
      });

      return { message, statusChanged, newStatus: dto.status };
    });

    // Fire notifications asynchronously
    this.notificationService.sendTicketReplyNotification(ticket.memberId, ticketId).catch((err) => {
      console.error('Failed to send ticket reply notification:', err);
    });

    if (result.statusChanged && result.newStatus) {
      this.notificationService
        .sendTicketStatusChangeNotification(ticket.memberId, ticketId, result.newStatus)
        .catch((err) => {
          console.error('Failed to send ticket status change notification:', err);
        });
    }

    return result.message;
  }
}
