import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminRole } from '../common/enums/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
export class AuditLogsController {
  constructor(private readonly activityLogService: AuditLogsService) {}

  @Get()
  async findAll(@Query() query: AuditLogQueryDto) {
    return this.activityLogService.findAll(query);
  }

  @Get('export')
  async exportExcel(
    @Query() query: AuditLogQueryDto,
    @Res() res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.activityLogService.exportExcel(query, res, user);
  }
}
