import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LoanConfigService } from './loan-config.service';
import {
  CreateLoanTypeDto,
  UpdateLoanTypeDto,
  CreateDepositSchemeDto,
  UpdateDepositSchemeDto,
  CalculateLoanDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminRole } from '@prisma/client';

@Controller('loan-config')
export class LoanConfigController {
  constructor(private readonly loanConfigService: LoanConfigService) {}

  @Public()
  @Get()
  async getActiveRates() {
    return this.loanConfigService.getActiveRates();
  }

  @Public()
  @Get('calculate')
  async calculateLoan(@Query() query: CalculateLoanDto) {
    return this.loanConfigService.calculateMemberLoan(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Post('loan-types')
  async createLoanType(@Body() dto: CreateLoanTypeDto) {
    return this.loanConfigService.createLoanType(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Patch('loan-types/:id')
  async updateLoanType(
    @Param('id') id: string,
    @Body() dto: UpdateLoanTypeDto,
    @CurrentUser() user: any,
  ) {
    return this.loanConfigService.updateLoanType(id, dto, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Post('deposit-schemes')
  async createDepositScheme(@Body() dto: CreateDepositSchemeDto) {
    return this.loanConfigService.createDepositScheme(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @Patch('deposit-schemes/:id')
  async updateDepositScheme(
    @Param('id') id: string,
    @Body() dto: UpdateDepositSchemeDto,
    @CurrentUser() user: any,
  ) {
    return this.loanConfigService.updateDepositScheme(id, dto, user.id);
  }
}
