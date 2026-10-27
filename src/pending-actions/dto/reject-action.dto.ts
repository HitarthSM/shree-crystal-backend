import { IsString, IsNotEmpty } from 'class-validator';

export class RejectActionDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
