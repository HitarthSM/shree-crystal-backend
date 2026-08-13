import { Module } from '@nestjs/common';
import { MembersController } from './controllers/members.controller.js';
import { MembersMeController } from './controllers/members-me.controller.js';
import { MembersService } from './services/members.service.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { PendingActionModule } from '../pending-action/pending-action.module.js';
import { EncryptionService, NotificationService } from '../common/services/index.js';

@Module({
  imports: [PrismaModule, PendingActionModule],
  controllers: [MembersController, MembersMeController],
  providers: [MembersService, EncryptionService, NotificationService],
  exports: [MembersService],
})
export class MembersModule {}
