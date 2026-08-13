import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class ReplaceStatementDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  // Assume file URL is provided directly in request or handled via file upload interceptor
  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}
