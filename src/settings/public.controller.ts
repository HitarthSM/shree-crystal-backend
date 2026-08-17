import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from '../settings/settings.service.js';
import { Public } from '../common/decorators/public.decorator.js';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get('content/:key')
  @ApiOperation({ summary: 'Get public website content by key' })
  @ApiResponse({ status: 200 })
  async getPublicContent(@Param('key') key: string): Promise<any> {
    // Only allow fetching keys that start with public.content
    if (!key.startsWith('public.content.')) {
      return {};
    }
    const content = await this.settingsService.getSetting(key);
    return content || {};
  }
}
