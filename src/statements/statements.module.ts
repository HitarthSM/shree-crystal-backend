import { Module } from '@nestjs/common';
import { StatementsService } from './statements.service.js';
import { AdminStatementsController } from './admin-statements.controller.js';
import { MemberStatementsController } from './member-statements.controller.js';
import { PrismaModule } from '../common/prisma/prisma.module.js';
import { NotificationService } from '../common/services/notification.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminStatementsController, MemberStatementsController],
  providers: [StatementsService, NotificationService],
})
export class StatementsModule {}
