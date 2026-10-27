import { IsOptional, IsEnum } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class SupportTicketFilterDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;
}
