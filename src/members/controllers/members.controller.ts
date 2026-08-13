import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { MembersService } from '../services/members.service.js';
import { CreateMemberDto } from '../dto/create-member.dto.js';
import { UpdateMemberDto } from '../dto/update-member.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminRole, MemberStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { PendingActionService } from '../../pending-action/pending-action.service.js';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(
    private readonly membersService: MembersService,
    private readonly pendingActionService: PendingActionService,
  ) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  create(@Body() createMemberDto: CreateMemberDto) {
    return this.membersService.create(createMemberDto);
  }

  @Post('import')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  importExcel(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          // Accept standard excel formats
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.membersService.importExcel(file, user.userId);
  }

  @Post('import/:batchId/confirm')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  confirmImport(@Param('batchId') batchId: string) {
    return this.membersService.confirmImport(batchId);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: MemberStatus,
  ) {
    return this.membersService.findAll(page, limit, search, status);
  }

  @Get('change-requests')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  getChangeRequests() {
    // Basic stub, ideally would have pagination
    return this.pendingActionService.findAll(); // Assuming we use pending action for this or a separate change request service
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  findOne(@Param('id') id: string) {
    return this.membersService.findOne(id);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  update(
    @Param('id') id: string,
    @Body() updateMemberDto: UpdateMemberDto,
    @CurrentUser() user: any,
  ) {
    return this.membersService.update(id, updateMemberDto, user.userId);
  }

  @Patch(':id/status')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: MemberStatus,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.membersService.changeStatus(id, status, reason, user.userId);
  }

  @Patch('change-requests/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
  resolveChangeRequest(
    @Param('id') id: string,
    @Body('approve') approve: boolean,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    if (approve) {
      return this.pendingActionService.approve(id, user.userId);
    } else {
      return this.pendingActionService.reject(id, user.userId, reason);
    }
  }
}
