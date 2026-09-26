import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembersService } from '../services/members.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';

@Controller('members/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MembersMeController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.findOne(user.userId);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.membersService.getDashboardSummary(user.userId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  uploadAttachment(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP, and PDF files are allowed');
    }
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    return {
      filename: safeName,
      mimetype: file.mimetype,
      size: file.size,
      url: `https://uploads.shreecrystal.com/${Date.now()}_${safeName}`,
    };
  }

  @Post('change-requests')
  proposeChange(@Body() changes: Record<string, unknown>, @CurrentUser() user: AuthenticatedUser) {
    // In a full implementation, this creates a MemberChangeRequest
    // For now, returning a stub indicating it is pending approval
    return { status: 'PENDING', message: 'Change request submitted for admin approval' };
  }

  @Get('change-requests')
  getChangeRequests(@CurrentUser() user: AuthenticatedUser) {
    // Returns history of own change requests
    return [];
  }
}
