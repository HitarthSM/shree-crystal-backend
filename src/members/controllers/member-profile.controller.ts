import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembersService } from '../services/members.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';
import { StorageService } from '../../storage/storage.service.js';

@Controller('members/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MemberProfileController {
  constructor(
    private readonly membersService: MembersService,
    private readonly storage: StorageService,
  ) {}

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
  async uploadAttachment(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // The type is read from the file's own bytes; the declared MIME type is ignored.
    const saved = await this.storage.saveAttachment(user.userId, file.buffer);
    return {
      filename: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'),
      mimetype: saved.mime,
      size: saved.size,
      // Storage key: pass it as attachmentUrl on a support message.
      url: saved.key,
    };
  }

  @Post('change-requests')
  proposeChange(): never {
    // Not built yet. Claiming "submitted" would be a lie: nothing is stored and no admin sees it.
    throw new NotImplementedException('Profile change requests are not available yet.');
  }

  @Get('change-requests')
  getChangeRequests(@CurrentUser() user: AuthenticatedUser) {
    // Returns history of own change requests
    return [];
  }
}
