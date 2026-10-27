import { BatchListQueryDto } from './dto/batch-list-query.dto.js';
import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../storage/storage.service.js';
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
import type { AuthenticatedUser } from '../auth/types/auth.types.js';

/** Monthly batches can hold one PDF per active member, so allow a few thousand small files. */
const STATEMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const STATEMENT_UPLOAD_LIMITS = { fileSize: STATEMENT_FILE_MAX_BYTES, files: 3000 };

@Controller('statements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminStatementsController {
  constructor(
    private readonly statementsService: StatementsService,
    private readonly storage: StorageService,
  ) {}

  @Post('batch')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @UseInterceptors(AnyFilesInterceptor({ limits: STATEMENT_UPLOAD_LIMITS }))
  async previewBatchUpload(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: BatchUploadStatementsDto,
    @UploadedFiles() rawFiles: Array<Express.Multer.File>,
  ) {
    // Files are written to local storage now; the batch keeps only each file's storage key.
    const files: Array<{ originalname: string; url: string }> = [];
    for (const f of rawFiles || []) {
      const saved = await this.storage.saveStatement(f.buffer);
      files.push({ originalname: f.originalname, url: saved.key });
    }
    return this.statementsService.previewBatchUpload(admin.id, dto, files);
  }

  @Post('batch/:batchId/publish')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async publishBatch(@Param('batchId') batchId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.statementsService.publishBatch(batchId, admin.id);
  }

  @Patch(':id/replace')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: STATEMENT_FILE_MAX_BYTES } }))
  async replaceStatement(
    @Param('id') id: string,
    @Body() dto: ReplaceStatementDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Replacement PDF is required (multipart field "file")');
    }
    const saved = await this.storage.saveStatement(file.buffer);
    return this.statementsService.replaceStatement(id, admin.id, {
      reason: dto.reason,
      fileUrl: saved.key,
    });
  }

  @Patch(':id/withdraw')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  async withdrawStatement(
    @Param('id') id: string,
    @Body() dto: WithdrawStatementDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.statementsService.withdrawStatement(id, admin.id, dto);
  }

  @Get('batches')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async findBatches(@Query() query: BatchListQueryDto) {
    return this.statementsService.findBatches(query);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  async findAdminStatements(@Query() query: StatementQueryDto) {
    return this.statementsService.findAdminStatements(query);
  }
}
