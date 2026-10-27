import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { NoticeCategory } from '@prisma/client';

export class CreateNoticeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @IsEnum(NoticeCategory)
  @IsOptional()
  category?: NoticeCategory;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  // http(s) only: a stored `javascript:` link would run when someone clicks it.
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
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
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  body?: string;

  @IsEnum(NoticeCategory)
  @IsOptional()
  category?: NoticeCategory;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  // http(s) only: a stored `javascript:` link would run when someone clicks it.
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @IsOptional()
  attachmentUrl?: string;
}
