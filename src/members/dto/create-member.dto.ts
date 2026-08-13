import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  Length,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

@ValidatorConstraint({ name: 'isAdult', async: false })
export class IsAdultConstraint implements ValidatorConstraintInterface {
  validate(dob: string, args: ValidationArguments) {
    if (!dob) return false;
    const date = new Date(dob);
    if (isNaN(date.getTime())) return false;

    const today = new Date();
    const age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
      return age - 1 >= 18;
    }
    return age >= 18;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Member must be at least 18 years old';
  }
}

export class CreateMemberDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  fullName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fatherOrHusbandName?: string;

  @ApiProperty({ example: '1990-01-01' })
  @IsDateString()
  @Validate(IsAdultConstraint)
  dob: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty()
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  addressLine2?: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @IsString()
  state: string;

  @ApiProperty()
  @IsString()
  @Length(6, 6)
  pincode: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[0-9]{10}$/, { message: 'Mobile must be a 10-digit number' })
  mobile: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: '12-digit Aadhaar number' })
  @IsString()
  @Matches(/^[0-9]{12}$/, { message: 'Aadhaar must be exactly 12 digits' })
  aadhaar: string;

  @ApiPropertyOptional({ description: '10-character alphanumeric PAN' })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i, { message: 'Invalid PAN format' })
  pan?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nomineeName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nomineeRelation?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nomineeContact?: string;
}
