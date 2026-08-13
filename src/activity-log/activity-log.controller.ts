import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminRole } from '../common/enums/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { GetActivityLogDto } from './dto/get-activity-log.dto';
import type { Response } from 'express';

@Controller('activity-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  async findAll(@Query() query: GetActivityLogDto) {
    return this.activityLogService.findAll(query);
  }

  @Get('export')
  async exportExcel(
    @Query() query: GetActivityLogDto,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    await this.activityLogService.exportExcel(query, res, user);
  }
}
