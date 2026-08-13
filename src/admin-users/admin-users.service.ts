import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  async create(createAdminUserDto: CreateAdminUserDto) {
    const existingUser = await this.prisma.adminUser.findUnique({
      where: { email: createAdminUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Admin user with this email already exists');
    }

    // Generate temp password (8 random alphanumeric characters)
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.adminUser.create({
      data: {
        email: createAdminUserDto.email,
        name: createAdminUserDto.name,
        role: createAdminUserDto.role,
        passwordHash,
        isFirstLogin: true,
      },
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
      tempPassword,
    };
  }

  async findAll() {
    return this.prisma.adminUser.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async updateRole(id: string, updateRoleDto: UpdateAdminRoleDto) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    return this.prisma.adminUser.update({
      where: { id },
      data: { role: updateRoleDto.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  }

  async deactivate(id: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Admin user not found');
    }

    return this.prisma.adminUser.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
