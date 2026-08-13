import { IsNotEmpty, IsString } from 'class-validator';

export class WithdrawStatementDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
