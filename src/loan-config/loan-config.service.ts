import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PendingActionService } from '../pending-action/pending-action.service';
import { LoanConfigActionHandler, RateChangePayload } from './loan-config-action.handler';
import {
  CreateLoanTypeDto,
  UpdateLoanTypeDto,
  CreateDepositSchemeDto,
  UpdateDepositSchemeDto,
  CalculateLoanDto,
} from './dto';
import { ActionType, RateEntityType, InterestType } from '@prisma/client';

@Injectable()
export class LoanConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pendingActionService: PendingActionService,
    private readonly actionHandler: LoanConfigActionHandler,
  ) {
    this.pendingActionService.registerHandler(ActionType.RATE_CHANGE, (payload, checkedById) =>
      this.actionHandler.handleRateChange(payload, checkedById!),
    );
    // Let's use RATE_CHANGE for both loan and deposit rate changes as the payload schema is generic
    this.pendingActionService.registerHandler(
      ActionType.DEPOSIT_SCHEME_CHANGE,
      (payload, checkedById) => this.actionHandler.handleRateChange(payload, checkedById!),
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

  calculateLoan(dto: CalculateLoanDto, loanType: any) {
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

  async createLoanType(dto: CreateLoanTypeDto, adminId: string) {
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
      await this.actionHandler.handleRateChange(payload, adminId);
      return { message: 'Update applied immediately.' };
    }
  }

  async createDepositScheme(dto: CreateDepositSchemeDto, adminId: string) {
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
      await this.actionHandler.handleRateChange(payload, adminId);
      return { message: 'Update applied immediately.' };
    }
  }
}
