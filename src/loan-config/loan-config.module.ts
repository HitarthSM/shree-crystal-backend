import { Module } from '@nestjs/common';
import { LoanConfigService } from './loan-config.service';
import { LoanConfigController } from './loan-config.controller';
import { LoanConfigActionHandler } from './loan-config-action.handler';
import { RateSchedulerService } from './rate-scheduler.service';
import { PendingActionModule } from '../pending-action/pending-action.module';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [PendingActionModule, PrismaModule],
  controllers: [LoanConfigController],
  providers: [LoanConfigService, LoanConfigActionHandler, RateSchedulerService],
})
export class LoanConfigModule {}
