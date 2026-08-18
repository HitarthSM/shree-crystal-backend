import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service.js';
import { BackupService } from './backup/backup.service.js';
import { SocietyDetailsDto } from './dto/society-details.dto.js';
import {
  NotificationGatewayDto,
  NotificationGatewayResponseDto,
} from './dto/notification-gateway.dto.js';
import { SecurityPolicyDto } from './dto/security-policy.dto.js';
import { BackupStatusDto } from './dto/backup-status.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminRole } from '../common/enums/index.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly backupService: BackupService,
  ) {}

  @Public()
  @Get('society')
  @ApiOperation({ summary: 'Get society details (Public)' })
  @ApiResponse({ status: 200, type: SocietyDetailsDto })
  async getSocietyDetails(): Promise<SocietyDetailsDto> {
    const details = await this.settingsService.getSocietyDetails();
    return details || ({} as SocietyDetailsDto);
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Put('society')
  @ApiOperation({ summary: 'Update society details (Super Admin)' })
  @ApiResponse({ status: 200 })
  async updateSocietyDetails(
    @Body() dto: SocietyDetailsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.settingsService.updateSocietyDetails(dto, user.userId);
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Get('notification-gateway')
  @ApiOperation({ summary: 'Get notification gateway config status (Super Admin)' })
  @ApiResponse({ status: 200, type: NotificationGatewayResponseDto })
  async getNotificationGatewayConfig(): Promise<NotificationGatewayResponseDto> {
    return this.settingsService.getNotificationGatewayConfig();
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Put('notification-gateway')
  @ApiOperation({ summary: 'Update notification gateway config (Super Admin)' })
  @ApiResponse({ status: 200 })
  async updateNotificationGateway(
    @Body() dto: NotificationGatewayDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.settingsService.updateNotificationGateway(dto, user.userId);
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Get('security')
  @ApiOperation({ summary: 'Get security policy settings (Super Admin)' })
  @ApiResponse({ status: 200, type: SecurityPolicyDto })
  async getSecurityPolicy(): Promise<SecurityPolicyDto> {
    const policy = await this.settingsService.getSecurityPolicy();
    return policy || ({} as SecurityPolicyDto);
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Put('security')
  @ApiOperation({ summary: 'Update security policy settings (Super Admin)' })
  @ApiResponse({ status: 200 })
  async updateSecurityPolicy(
    @Body() dto: SecurityPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.settingsService.updateSecurityPolicy(dto, user.userId);
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Get('backup')
  @ApiOperation({ summary: 'Get backup status (Super Admin)' })
  @ApiResponse({ status: 200, type: BackupStatusDto })
  async getBackupStatus(): Promise<BackupStatusDto> {
    const status = await this.settingsService.getBackupStatus();
    return status || {};
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN)
  @Post('backup/run-now')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a database backup (Super Admin)' })
  @ApiResponse({ status: 200, description: 'Backup executed successfully' })
  async runBackup(): Promise<void> {
    await this.backupService.runBackup();
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Get('public-content/:key')
  @ApiOperation({ summary: 'Get public content setting (Admin)' })
  @ApiResponse({ status: 200 })
  async getAdminPublicContent(@Param('key') key: string): Promise<any> {
    if (!key.startsWith('public.content.')) {
      throw new BadRequestException('Invalid key namespace');
    }
    const content = await this.settingsService.getSetting(key);
    return content || {};
  }

  @ApiBearerAuth()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Put('public-content/:key')
  @ApiOperation({ summary: 'Update public content setting (Admin)' })
  @ApiResponse({ status: 200 })
  async updateAdminPublicContent(
    @Param('key') key: string,
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    if (!key.startsWith('public.content.')) {
      throw new BadRequestException('Invalid key namespace');
    }
    await this.settingsService.updateSetting(key, dto, user.userId);
  }
}
