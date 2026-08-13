import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { StatementStatus } from '@prisma/client';

export class StatementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(StatementStatus)
  status?: StatementStatus;
}
