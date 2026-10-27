import { IsNotEmpty, IsString } from 'class-validator';

export class ReplaceStatementDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

/** What the service stores: the DTO fields plus the storage key the controller produced. */
export interface ReplaceStatementInput extends ReplaceStatementDto {
  fileUrl: string;
}
