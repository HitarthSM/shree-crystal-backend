import { Global, Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { SettingsModule } from '../settings/settings.module.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => SettingsModule)],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
