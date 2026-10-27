import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BatchStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/index.js';

export class BatchListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BatchStatus })
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;
}
