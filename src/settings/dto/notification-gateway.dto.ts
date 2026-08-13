import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationGatewayDto {
  @ApiPropertyOptional({ description: 'SMS API Key for sending notifications' })
  @IsString()
  @IsOptional()
  smsApiKey?: string;

  @ApiPropertyOptional({ description: 'SMTP URL for sending emails' })
  @IsString()
  @IsOptional()
  smtpUrl?: string;

  @ApiPropertyOptional({ description: 'From address for emails' })
  @IsString()
  @IsOptional()
  smtpFrom?: string;
}

export class NotificationGatewayResponseDto {
  @ApiProperty({ example: true })
  smsApiKeyConfigured: boolean;

  @ApiProperty({ example: true })
  smtpUrlConfigured: boolean;

  @ApiPropertyOptional({ example: 'noreply@shree-crystal.com' })
  smtpFrom?: string;
}
