import { IsString, IsNotEmpty, IsOptional, IsUrl, IsEnum } from 'class-validator';
import { QueryStatus } from '@prisma/client';

export class AdminReplyDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsUrl()
  @IsOptional()
  attachmentUrl?: string;

  @IsEnum(QueryStatus)
  @IsOptional()
  status?: QueryStatus;
}
