import { IsNumber, IsBoolean, IsObject, ValidateNested, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PasswordPolicyDto {
  @ApiProperty({ example: 8 })
  @IsNumber()
  @Min(6)
  minLength: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  requireUppercase: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  requireLowercase: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  requireNumbers: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  requireSpecialCharacters: boolean;
}

export class MakerCheckerPolicyDto {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  loanApproval?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  memberApproval?: boolean;
}

export class SecurityPolicyDto {
  @ApiProperty({ example: 30, description: 'Session timeout in minutes' })
  @IsNumber()
  @Min(1)
  sessionTimeoutMinutes: number;

  @ApiProperty({ type: PasswordPolicyDto })
  @ValidateNested()
  @Type(() => PasswordPolicyDto)
  @IsObject()
  passwordPolicy: PasswordPolicyDto;

  @ApiProperty({ type: MakerCheckerPolicyDto })
  @ValidateNested()
  @Type(() => MakerCheckerPolicyDto)
  @IsObject()
  makerCheckerEnabled: MakerCheckerPolicyDto;
}
