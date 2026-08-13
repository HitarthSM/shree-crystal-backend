import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { StatementsService } from './statements.service.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';

@Controller('statements/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MemberStatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @Get()
  async findMemberStatements(@CurrentUser() user: any, @Query() query: StatementQueryDto) {
    // Explicitly enforce the memberId from the JWT
    return this.statementsService.findMemberStatements(user.memberId, query);
  }

  @Get(':id/download')
  async downloadStatement(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const fileUrl = await this.statementsService.getMemberStatementFileUrl(id, user.memberId);
    // In a real application, you might stream the file from S3 using the URL.
    // Here we'll just redirect to the URL or return it.
    res.redirect(fileUrl);
  }
}
