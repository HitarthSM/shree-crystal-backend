import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BackupStatusDto {
  @ApiPropertyOptional({ description: 'Timestamp of the last backup attempt' })
  lastBackupTimestamp?: Date;

  @ApiPropertyOptional({ description: 'Status of the last backup attempt', example: 'SUCCESS' })
  status?: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
}
