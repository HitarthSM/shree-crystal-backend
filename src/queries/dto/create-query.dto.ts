import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class CreateQueryDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsUrl()
  @IsOptional()
  attachmentUrl?: string;
}
