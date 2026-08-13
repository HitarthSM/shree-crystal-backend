import { IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';
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
}
