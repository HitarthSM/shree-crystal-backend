import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto.js';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  @ApiProperty({ description: 'Reason for the update (required for maker-checker workflow)' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
