import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { NoticeCategory } from '@prisma/client';

export class CreateNoticeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(NoticeCategory)
  @IsOptional()
  category?: NoticeCategory;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  // We add this to know who the notice is intended for.
  // In the mock data it's "All Members", but it could be "DEFAULTERS", "ACTIVE", etc.
  @IsString()
  @IsOptional()
  target?: string;
}

export class UpdateNoticeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsEnum(NoticeCategory)
  @IsOptional()
  category?: NoticeCategory;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;
}
