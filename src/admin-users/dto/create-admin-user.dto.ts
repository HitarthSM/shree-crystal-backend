import { IsEmail, IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { AdminRole } from '@prisma/client';

export class CreateAdminUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(AdminRole)
  @IsNotEmpty()
  role: AdminRole;
}
