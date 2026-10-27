import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { PendingActionsService } from './pending-actions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminRole } from '../common/enums';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActionType } from '@prisma/client';
import { RejectActionDto } from './dto/reject-action.dto';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pending-actions')
export class PendingActionsController {
  constructor(private readonly pendingActionService: PendingActionsService) {}

  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  @Get()
  async findAll(@Query('actionType') actionType?: ActionType) {
    return this.pendingActionService.findAll(actionType);
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pendingActionService.approve(id, user.userId);
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pendingActionService.reject(id, user.userId, body.reason);
  }
}
