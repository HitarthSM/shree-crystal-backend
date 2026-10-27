import { Module } from '@nestjs/common';
import { LoanConfigService } from './loan-config.service';
import { LoanConfigController } from './loan-config.controller';
import { RateSchedulerService } from './rate-scheduler.service';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PendingActionsModule, PrismaModule],
  controllers: [LoanConfigController],
  providers: [LoanConfigService, RateSchedulerService],
})
export class LoanConfigModule {}
