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

    // 1. Find all RateHistory records where effectiveFrom <= now
    // We want the LATEST one for each schemeId that hasn't been applied yet.
    // However, Prisma makes this complex. We can just query those where effectiveFrom <= now.
    // And for each, we check if the current scheme's interestRate != newRate.

    const pendingRateHistories = await this.prisma.rateHistory.findMany({
      where: {
        effectiveFrom: {
          lte: now,
        },
      },
      orderBy: {
        effectiveFrom: 'asc', // Apply older ones first just in case
      },
    });

    for (const history of pendingRateHistories) {
      if (history.schemeType === RateEntityType.LOAN_TYPE) {
        const loanType = await this.prisma.loanType.findUnique({
          where: { id: history.schemeId },
        });

        // Only apply if the rate is different (meaning it hasn't been applied by a newer record)
        // Note: we convert Decimal to Number for comparison, but Prisma Decimal returns an object.
        if (loanType && Number(loanType.interestRate) !== Number(history.newRate)) {
          await this.prisma.loanType.update({
            where: { id: loanType.id },
            data: { interestRate: history.newRate },
          });
          this.logger.log(`Applied future rate ${history.newRate} to LOAN_TYPE ${loanType.name}`);
        }
      } else if (history.schemeType === RateEntityType.DEPOSIT_SCHEME) {
        const scheme = await this.prisma.depositScheme.findUnique({
          where: { id: history.schemeId },
        });

        if (scheme && Number(scheme.interestRate) !== Number(history.newRate)) {
          await this.prisma.depositScheme.update({
            where: { id: scheme.id },
            data: { interestRate: history.newRate },
          });
          this.logger.log(
            `Applied future rate ${history.newRate} to DEPOSIT_SCHEME ${scheme.name}`,
          );
        }
      }
    }
  }
}
