import { Module } from '@nestjs/common';
import { PendingActionService } from './pending-action.service';
import { PendingActionController } from './pending-action.controller';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PendingActionService],
  controllers: [PendingActionController],
  exports: [PendingActionService],
})
export class PendingActionModule {}
