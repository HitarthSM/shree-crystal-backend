import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { MembersService } from '../services/members.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@Controller('members/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MembersMeController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  getProfile(@CurrentUser() user: any) {
    return this.membersService.findOne(user.userId);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: any) {
    return this.membersService.getDashboardSummary(user.userId);
  }

  @Post('change-requests')
  proposeChange(@Body() changes: any, @CurrentUser() user: any) {
    // In a full implementation, this creates a MemberChangeRequest
    // For now, returning a stub indicating it is pending approval
    return { status: 'PENDING', message: 'Change request submitted for admin approval' };
  }

  @Get('change-requests')
  getChangeRequests(@CurrentUser() user: any) {
    // Returns history of own change requests
    return [];
  }
}
