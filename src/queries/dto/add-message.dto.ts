import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class AddMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsUrl()
  @IsOptional()
  attachmentUrl?: string;
}
