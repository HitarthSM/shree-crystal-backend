import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { MemberOwnershipGuard } from '../common/guards/member-ownership.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { StatementsService } from './statements.service.js';
import { StorageService } from '../storage/storage.service.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';
import type { AuthMemberUser } from '../auth/types/auth.types.js';

@Controller('statements/me')
@UseGuards(JwtAuthGuard, MemberOwnershipGuard)
export class MemberStatementsController {
  constructor(
    private readonly statementsService: StatementsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async findMemberStatements(
    @CurrentUser() user: AuthMemberUser,
    @Query() query: StatementQueryDto,
  ) {
    return this.statementsService.findMemberStatements(user.membershipNumber, query);
  }

  @Get(':id/download')
  async downloadStatement(
    @Param('id') id: string,
    @CurrentUser() user: AuthMemberUser,
    @Res() res: Response,
  ) {
    const fileKey = await this.statementsService.getMemberStatementFileUrl(
      id,
      user.membershipNumber,
    );
    // Streamed through the API so the ownership check above applies to every download.
    const { stream, mime, size } = await this.storage.open(fileKey);
    res.set({
      'Content-Type': mime,
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="statement-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
