import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { QueriesService } from '../queries.service.js';
import { CreateQueryDto } from '../dto/create-query.dto.js';
import { AddMessageDto } from '../dto/add-message.dto.js';
import { AdminReplyDto } from '../dto/admin-reply.dto.js';

@Controller('queries')
@UseGuards(JwtAuthGuard)
export class MemberQueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  @Post()
  async createQuery(@CurrentUser() user: any, @Body() dto: CreateQueryDto) {
    return this.queriesService.createMemberQuery(user.memberId, dto);
  }

  @Get('me')
  @UseGuards(MemberOwnershipGuard)
  async getMyQueries(@CurrentUser() user: any) {
    return this.queriesService.getMemberQueries(user.memberId);
  }

  @Get('me/:id')
  @UseGuards(MemberOwnershipGuard)
  async getMyQueryById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.queriesService.getMemberQueryById(user.memberId, id);
  }

  @Post('me/:id/reopen')
  @UseGuards(MemberOwnershipGuard)
  async reopenMyQuery(@CurrentUser() user: any, @Param('id') id: string) {
    return this.queriesService.reopenMemberQuery(user.memberId, id);
  }

  @Post(':id/messages')
  // This endpoint handles both member and admin replies since the route is the same.
  async addMessage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddMessageDto | AdminReplyDto,
  ) {
    // Admin users have a 'role' property.
    if (user.role) {
      return this.queriesService.addAdminReply(user.id, id, dto);
    }

    // Fallback to member
    return this.queriesService.addMemberMessage(user.memberId, id, dto);
  }
}
