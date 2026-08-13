import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExplicitMappingDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class BatchUploadStatementsDto {
  @IsString()
  @IsNotEmpty()
  period: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExplicitMappingDto)
  explicitMapping?: ExplicitMappingDto[];

  // Note: we assume files are passed as multipart/form-data. This DTO covers the form fields.
}
