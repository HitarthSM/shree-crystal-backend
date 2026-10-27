import { IsString, IsNotEmpty, IsOptional, Matches, IsEnum, MaxLength } from 'class-validator';
import { ATTACHMENT_KEY_PATTERN } from '../../storage/storage.service.js';
import { TicketStatus } from '@prisma/client';

export class AdminReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  /** Storage key returned by POST /members/me/upload. */
  @Matches(ATTACHMENT_KEY_PATTERN, {
    message: 'attachmentUrl must be a file uploaded through the app',
  })
  @IsOptional()
  attachmentUrl?: string;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;
}
