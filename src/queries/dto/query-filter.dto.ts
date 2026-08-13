import { IsOptional, IsEnum } from 'class-validator';
import { QueryStatus } from '@prisma/client';

export class QueryFilterDto {
  @IsEnum(QueryStatus)
  @IsOptional()
  status?: QueryStatus;
}
