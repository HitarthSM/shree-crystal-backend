import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsPositive,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InterestType, DepositType } from '@prisma/client';

export class CreateLoanTypeDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  interestRate: number;

  @IsEnum(InterestType)
  interestType: InterestType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxTenure?: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  processingFee: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minAmount: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxAmount: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateLoanTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  interestRate?: number;

  @IsOptional()
  @IsEnum(InterestType)
  interestType?: InterestType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxTenure?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  processingFee?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxAmount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class CreateDepositSchemeDto {
  @IsString()
  name: string;

  @IsEnum(DepositType)
  type: DepositType;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  interestRate: number;

  @IsOptional()
  tenureOptions?: any; // e.g., JSON array

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDepositSchemeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DepositType)
  type?: DepositType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  interestRate?: number;

  @IsOptional()
  tenureOptions?: any;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class CalculateLoanDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  tenure: number; // in months

  @IsString()
  loanTypeId: string;
}
