import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post()
  create(@Body() createAdminUserDto: CreateAdminUserDto) {
    return this.adminUsersService.create(createAdminUserDto);
  }

  @Get()
  findAll() {
    return this.adminUsersService.findAll();
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateAdminRoleDto) {
    return this.adminUsersService.updateRole(id, updateRoleDto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.adminUsersService.deactivate(id);
  }
}
