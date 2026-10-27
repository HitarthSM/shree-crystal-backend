import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { MemberStatus } from '@prisma/client';

export class ChangeMemberStatusDto {
  @ApiProperty({ enum: MemberStatus })
  @IsEnum(MemberStatus)
  status: MemberStatus;

  @ApiProperty({ description: 'Reason for the change (shown to the approver)' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
