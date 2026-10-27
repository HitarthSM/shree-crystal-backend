import { Module } from '@nestjs/common';
import { PendingActionsService } from './pending-actions.service';
import { PendingActionsController } from './pending-actions.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PendingActionsService],
  controllers: [PendingActionsController],
  exports: [PendingActionsService],
})
export class PendingActionsModule {}
