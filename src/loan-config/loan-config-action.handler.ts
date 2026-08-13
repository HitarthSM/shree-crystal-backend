import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ActionType, PendingActionStatus, RateEntityType } from '@prisma/client';

export type RateChangePayload = {
  schemeId: string;
  schemeType: RateEntityType;
  oldRate: number | null;
  newRate: number;
  effectiveFrom: string; // ISO String
  changedById: string;
  data: any; // Other fields that changed
};

@Injectable()
export class LoanConfigActionHandler {
  private readonly logger = new Logger(LoanConfigActionHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle the approval of a RATE_CHANGE or DEPOSIT_SCHEME_CHANGE.
   * Note: This is called by PendingActionService when an action is approved.
   */
  async handleRateChange(payload: RateChangePayload, approvedById: string) {
    this.logger.log(`Handling rate change for ${payload.schemeType} ${payload.schemeId}`);

    const effectiveFromDate = new Date(payload.effectiveFrom);
    const now = new Date();

    // 1. Create the RateHistory ledger row
    await this.prisma.rateHistory.create({
      data: {
        schemeId: payload.schemeId,
        schemeType: payload.schemeType,
        oldRate: payload.oldRate,
        newRate: payload.newRate,
        effectiveFrom: effectiveFromDate,
        changedById: payload.changedById,
        approvedById: approvedById,
      },
    });

    // 2. If effectiveFrom is in the past or now, apply the change directly to the entity
    if (effectiveFromDate <= now) {
      if (payload.schemeType === RateEntityType.LOAN_TYPE) {
        await this.prisma.loanType.update({
          where: { id: payload.schemeId },
          data: {
            ...payload.data,
            interestRate: payload.newRate,
          },
        });
      } else {
        await this.prisma.depositScheme.update({
          where: { id: payload.schemeId },
          data: {
            ...payload.data,
            interestRate: payload.newRate,
          },
        });
      }
      this.logger.log(`Applied rate change to ${payload.schemeType} immediately.`);
    } else {
      // 3. Otherwise, the scheduled job will pick it up
      // But we still apply any non-rate changes (like name, maxAmount, etc.) if they exist in `data`?
      // Actually, if it's a rate change, usually we want to apply all non-rate fields immediately,
      // and only defer the interestRate. Let's do that for robustness.
      const dataWithoutRate = { ...payload.data };
      delete dataWithoutRate.interestRate;

      if (Object.keys(dataWithoutRate).length > 0) {
        if (payload.schemeType === RateEntityType.LOAN_TYPE) {
          await this.prisma.loanType.update({
            where: { id: payload.schemeId },
            data: dataWithoutRate,
          });
        } else {
          await this.prisma.depositScheme.update({
            where: { id: payload.schemeId },
            data: dataWithoutRate,
          });
        }
      }

      this.logger.log(
        `Rate is in future (${effectiveFromDate.toISOString()}), scheduled job will apply it. Applied other fields immediately.`,
      );
    }
  }
}
