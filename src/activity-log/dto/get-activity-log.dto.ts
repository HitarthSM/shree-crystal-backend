import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class GetActivityLogDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by actor ID (user or member)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @IsString()
  actionType?: string;

  @ApiPropertyOptional({ description: 'Filter by resource/entity type' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Start date for filtering logs' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering logs' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
