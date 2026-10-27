import { IsString, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';
import { ATTACHMENT_KEY_PATTERN } from '../../storage/storage.service.js';

export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

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
}
