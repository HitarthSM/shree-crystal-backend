import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminRole } from '../common/enums/index.js';
import { StatementsService } from './statements.service.js';
import { BatchUploadStatementsDto } from './dto/batch-upload-statements.dto.js';
import { ReplaceStatementDto } from './dto/replace-statement.dto.js';
import { WithdrawStatementDto } from './dto/withdraw-statement.dto.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';

@Controller('statements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminStatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @Post('batch')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @UseInterceptors(AnyFilesInterceptor())
  async previewBatchUpload(
    @CurrentUser() admin: any,
    @Body() dto: BatchUploadStatementsDto,
    @UploadedFiles() rawFiles: Array<Express.Multer.File>,
  ) {
    // In a real app, interceptor/middleware uploads this to S3 and gives us URLs.
    // For this prototype, we mock the URLs.
    const files = (rawFiles || []).map((f) => ({
      originalname: f.originalname,
      url: `https://mock-storage.com/${f.originalname}`,
    }));
    return this.statementsService.previewBatchUpload(admin.id, dto, files);
  }

  @Post('batch/:batchId/publish')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async publishBatch(@Param('batchId') batchId: string, @CurrentUser() admin: any) {
    return this.statementsService.publishBatch(batchId, admin.id);
  }

  @Patch(':id/replace')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async replaceStatement(
    @Param('id') id: string,
    @Body() dto: ReplaceStatementDto,
    @CurrentUser() admin: any,
  ) {
    return this.statementsService.replaceStatement(id, admin.id, dto);
  }

  @Patch(':id/withdraw')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async withdrawStatement(
    @Param('id') id: string,
    @Body() dto: WithdrawStatementDto,
    @CurrentUser() admin: any,
  ) {
    return this.statementsService.withdrawStatement(id, admin.id, dto);
  }

  @Get('batches')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async findBatches(@Query() query: any) {
    return this.statementsService.findBatches(query);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async findAdminStatements(@Query() query: StatementQueryDto) {
    return this.statementsService.findAdminStatements(query);
  }
}
