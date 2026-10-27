import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { RateEntityType } from '@prisma/client';

@Injectable()
export class RateSchedulerService {
  private readonly logger = new Logger(RateSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async applyFutureRates() {
    this.logger.log('Checking for future rates to apply...');
    const now = new Date();

    // Oldest first, so the last row seen for a scheme is the one currently in force.
    const due = await this.prisma.rateHistory.findMany({
      where: { effectiveFrom: { lte: now } },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      select: { entityId: true, entityType: true, newRate: true },
    });

    const latestPerScheme = new Map<string, (typeof due)[number]>();
    for (const history of due) {
      latestPerScheme.set(`${history.entityType}:${history.entityId}`, history);
    }

    for (const history of latestPerScheme.values()) {
      if (history.entityType === RateEntityType.LOAN_TYPE) {
        const result = await this.prisma.loanType.updateMany({
          where: { id: history.entityId, NOT: { interestRate: history.newRate } },
          data: { interestRate: history.newRate },
        });
        if (result.count > 0) {
          this.logger.log(`Applied rate ${history.newRate} to LOAN_TYPE ${history.entityId}`);
        }
      } else if (history.entityType === RateEntityType.DEPOSIT_SCHEME) {
        const result = await this.prisma.depositScheme.updateMany({
          where: { id: history.entityId, NOT: { interestRate: history.newRate } },
          data: { interestRate: history.newRate },
        });
        if (result.count > 0) {
          this.logger.log(`Applied rate ${history.newRate} to DEPOSIT_SCHEME ${history.entityId}`);
        }
      }
    }
  }
}
