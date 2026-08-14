import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { NoticesService } from './notices.service.js';

@Controller('notices/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MemberNoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  async getMemberNotices(@CurrentUser() user: any) {
    return this.noticesService.getMemberNotices(user.memberId);
  }
}
