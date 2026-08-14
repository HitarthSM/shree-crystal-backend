import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminRole } from '../../common/enums/index.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { QueriesService } from '../queries.service.js';
import { AdminReplyDto } from '../dto/admin-reply.dto.js';
import { QueryFilterDto } from '../dto/query-filter.dto.js';

@Controller('queries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminQueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async getAllQueries(@Query() filterDto: QueryFilterDto) {
    return this.queriesService.getAdminQueries(filterDto);
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async getQueryById(@Param('id') id: string) {
    // The service doesn't have a specific admin GetById method,
    // but we can query it using Prisma directly here, or add it to the service.
    // Wait, let's look at the queries service again. It has getMemberQueryById,
    // but an admin should be able to view any query. Let's just use Prisma directly here or
    // we can use the service method if we create it. Actually, I will update the service too.
    return this.queriesService.getAdminQueryById(id);
  }

  @Post(':id/reply')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async replyToQuery(
    @Param('id') id: string,
    @Body() replyDto: AdminReplyDto,
    @CurrentUser() user: any,
  ) {
    return this.queriesService.addAdminReply(user.userId, id, replyDto);
  }
}
