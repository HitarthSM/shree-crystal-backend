import { Controller, Post, Get, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SupportTicketsService } from '../support-tickets.service.js';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto.js';
import { AddMessageDto } from '../dto/add-message.dto.js';
import { AdminReplyDto } from '../dto/admin-reply.dto.js';
import { AdminRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';

@Controller('support-tickets')
@UseGuards(JwtAuthGuard)
export class MemberSupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  async createTicket(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupportTicketDto) {
    return this.supportTicketsService.createMemberTicket(user.userId, dto);
  }

  @Get('me')
  @UseGuards(MemberOwnershipGuard)
  async getMyTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.supportTicketsService.getMemberTickets(user.userId);
  }

  @Get('me/:id')
  @UseGuards(MemberOwnershipGuard)
  async getMyTicketById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supportTicketsService.getMemberTicketById(user.userId, id);
  }

  @Post('me/:id/reopen')
  @UseGuards(MemberOwnershipGuard)
  async reopenMyTicket(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supportTicketsService.reopenMemberTicket(user.userId, id);
  }

  @Post(':id/messages')
  // This endpoint handles both member and admin replies since the route is the same.
  async addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddMessageDto | AdminReplyDto,
  ) {
    // Admin users have a 'role' property.
    if (user.role) {
      // Same rule as POST /tickets/:id/reply on the admin controller: read-only roles can't reply.
      if (user.role === AdminRole.VIEWER) {
        throw new ForbiddenException('You do not have permission to access this resource.');
      }
      return this.supportTicketsService.addAdminReply(user.id, id, dto);
    }

    // Fallback to member
    return this.supportTicketsService.addMemberMessage(user.userId, id, dto);
  }
}
