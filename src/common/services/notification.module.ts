import { Global, Module, forwardRef } from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { SettingsModule } from '../../settings/settings.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => SettingsModule)],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
