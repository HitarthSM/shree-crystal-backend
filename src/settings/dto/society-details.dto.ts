import { IsString, IsNotEmpty, IsUrl, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocietyDetailsDto {
  @ApiProperty({ example: 'Shree Crystal Society' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'REG-123456' })
  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @ApiProperty({ example: '123 Main Street, City, Country' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'State Bank of India' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: '38942001920' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{9,18}$/, { message: 'accountNumber must be 9 to 18 digits' })
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'SBIN0001234' })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'ifscCode must look like ABCD0123456' })
  ifscCode?: string;

  @ApiPropertyOptional({ example: 'shreecrystal@sbi' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, { message: 'upiVpa must look like name@bank' })
  upiVpa?: string;
}
