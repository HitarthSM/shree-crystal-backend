import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminRole } from '../../common/enums/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SupportTicketsService } from '../support-tickets.service.js';
import { AdminReplyDto } from '../dto/admin-reply.dto.js';
import { SupportTicketFilterDto } from '../dto/support-ticket-filter.dto.js';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';

@Controller('support-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async getAllTickets(@Query() filterDto: SupportTicketFilterDto) {
    return this.supportTicketsService.getAdminTickets(filterDto);
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async getTicketById(@Param('id') id: string) {
    return this.supportTicketsService.getAdminTicketById(id);
  }

  @Post(':id/reply')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async replyToTicket(
    @Param('id') id: string,
    @Body() replyDto: AdminReplyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supportTicketsService.addAdminReply(user.userId, id, replyDto);
  }
}
