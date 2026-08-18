import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, LoanType, ActionType, RateEntityType, InterestType } from '@prisma/client';
import { PendingActionService } from '../pending-action/pending-action.service';
import {
  CreateLoanTypeDto,
  UpdateLoanTypeDto,
  CreateDepositSchemeDto,
  UpdateDepositSchemeDto,
  CalculateLoanDto,
} from './dto';

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
export class LoanConfigService {
  private readonly logger = new Logger(LoanConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pendingActionService: PendingActionService,
  ) {
    this.pendingActionService.registerHandler(ActionType.RATE_CHANGE, (payload, checkedById) =>
      this.handleRateChange(payload as RateChangePayload, checkedById!),
    );
    this.pendingActionService.registerHandler(
      ActionType.DEPOSIT_SCHEME_CHANGE,
      (payload, checkedById) => this.handleRateChange(payload as RateChangePayload, checkedById!),
    );
  }

  // --- Public Endpoints ---

  async getActiveRates() {
    const [loanTypes, depositSchemes] = await Promise.all([
      this.prisma.loanType.findMany({ where: { active: true } }),
      this.prisma.depositScheme.findMany({ where: { active: true } }),
    ]);
    return { loanTypes, depositSchemes };
  }

  calculateLoan(dto: CalculateLoanDto, loanType: LoanType) {
    const { amount, tenure } = dto;
    const rate = Number(loanType.interestRate); // Annual rate

    if (loanType.minAmount && amount < Number(loanType.minAmount)) {
      throw new Error(`Amount must be at least ${loanType.minAmount}`);
    }
    if (loanType.maxAmount && amount > Number(loanType.maxAmount)) {
      throw new Error(`Amount must be at most ${loanType.maxAmount}`);
    }
    if (loanType.maxTenure && tenure > loanType.maxTenure) {
      throw new Error(`Tenure must be at most ${loanType.maxTenure} months`);
    }

    if (loanType.interestType === InterestType.FLAT) {
      const interest = (amount * rate * (tenure / 12)) / 100;
      const total = amount + interest;
      const emi = total / tenure;
      return {
        principal: amount,
        interest,
        total,
        emi,
        processingFee: Number(loanType.processingFee),
      };
    } else {
      // Reducing balance
      const r = rate / 100 / 12;
      let emi = 0;
      if (r === 0) {
        emi = amount / tenure;
      } else {
        emi = (amount * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
      }
      const total = emi * tenure;
      const interest = total - amount;
      return {
        principal: amount,
        interest,
        total,
        emi,
        processingFee: Number(loanType.processingFee),
      };
    }
  }

  async calculateMemberLoan(dto: CalculateLoanDto) {
    const loanType = await this.prisma.loanType.findUnique({ where: { id: dto.loanTypeId } });
    if (!loanType) throw new NotFoundException('Loan type not found');
    try {
      return this.calculateLoan(dto, loanType);
    } catch (e: any) {
      throw new NotFoundException(e.message);
    }
  }

  // --- Admin Endpoints ---

  async createLoanType(dto: CreateLoanTypeDto) {
    return this.prisma.loanType.create({
      data: dto,
    });
  }

  async updateLoanType(id: string, dto: UpdateLoanTypeDto, adminId: string) {
    const current = await this.prisma.loanType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Loan type not found');

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const isMakerCheckerRequired = await this.pendingActionService.isMakerCheckerRequired(
      ActionType.RATE_CHANGE,
    );

    const payload: RateChangePayload = {
      schemeId: id,
      schemeType: RateEntityType.LOAN_TYPE,
      oldRate: Number(current.interestRate),
      newRate: dto.interestRate ?? Number(current.interestRate),
      effectiveFrom: effectiveFrom.toISOString(),
      changedById: adminId,
      data: {
        name: dto.name,
        interestType: dto.interestType,
        maxTenure: dto.maxTenure,
        processingFee: dto.processingFee,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        active: dto.active,
      },
    };

    if (isMakerCheckerRequired) {
      await this.pendingActionService.propose(ActionType.RATE_CHANGE, payload, adminId);
      return { message: 'Update proposed for maker-checker approval.' };
    } else {
      await this.handleRateChange(payload, adminId);
      return { message: 'Update applied immediately.' };
    }
  }

  async createDepositScheme(dto: CreateDepositSchemeDto) {
    return this.prisma.depositScheme.create({
      data: dto,
    });
  }

  async updateDepositScheme(id: string, dto: UpdateDepositSchemeDto, adminId: string) {
    const current = await this.prisma.depositScheme.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Deposit scheme not found');

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const isMakerCheckerRequired = await this.pendingActionService.isMakerCheckerRequired(
      ActionType.DEPOSIT_SCHEME_CHANGE,
    );

    const payload: RateChangePayload = {
      schemeId: id,
      schemeType: RateEntityType.DEPOSIT_SCHEME,
      oldRate: Number(current.interestRate),
      newRate: dto.interestRate ?? Number(current.interestRate),
      effectiveFrom: effectiveFrom.toISOString(),
      changedById: adminId,
      data: {
        name: dto.name,
        type: dto.type,
        tenureOptions: dto.tenureOptions,
        active: dto.active,
      },
    };

    if (isMakerCheckerRequired) {
      await this.pendingActionService.propose(ActionType.DEPOSIT_SCHEME_CHANGE, payload, adminId);
      return { message: 'Update proposed for maker-checker approval.' };
    } else {
      await this.handleRateChange(payload, adminId);
      return { message: 'Update applied immediately.' };
    }
  }

  async handleRateChange(payload: RateChangePayload, approvedById: string) {
    this.logger.log(`Handling rate change for ${payload.schemeType} ${payload.schemeId}`);

    const effectiveFromDate = new Date(payload.effectiveFrom);
    const now = new Date();

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
