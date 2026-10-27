import { Module } from '@nestjs/common';
import { MembersController } from './controllers/members.controller.js';
import { MemberProfileController } from './controllers/member-profile.controller.js';
import { MembersService } from './services/members.service.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { PendingActionsModule } from '../pending-actions/pending-actions.module.js';
import { EncryptionService } from '../common/services/index.js';

@Module({
  imports: [PrismaModule, PendingActionsModule],
  controllers: [MemberProfileController, MembersController],
  providers: [MembersService, EncryptionService],
  exports: [MembersService],
})
export class MembersModule {}
