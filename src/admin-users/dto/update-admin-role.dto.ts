import { IsEnum, IsNotEmpty } from 'class-validator';
import { AdminRole } from '@prisma/client';

export class UpdateAdminRoleDto {
  @IsEnum(AdminRole)
  @IsNotEmpty()
  role: AdminRole;
}
