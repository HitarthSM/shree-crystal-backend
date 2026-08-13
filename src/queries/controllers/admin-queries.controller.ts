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
}
