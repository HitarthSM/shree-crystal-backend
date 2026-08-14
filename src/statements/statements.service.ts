import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationService } from '../common/services/notification.service.js';
import { BatchUploadStatementsDto } from './dto/batch-upload-statements.dto.js';
import { ReplaceStatementDto } from './dto/replace-statement.dto.js';
import { WithdrawStatementDto } from './dto/withdraw-statement.dto.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';

@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async previewBatchUpload(
    adminId: string,
    dto: BatchUploadStatementsDto,
    files: Array<{ originalname: string; url: string }>,
  ) {
    // files contains the uploaded files metadata.
    // In a real implementation, we'd upload these to S3 and have the URLs.

    const matchedStatements = [];
    const unmatchedList = [];

    // If explicit mapping is provided, use it
    if (dto.explicitMapping && dto.explicitMapping.length > 0) {
      for (const mapping of dto.explicitMapping) {
        const file = files.find((f) => f.originalname === mapping.fileName);
        if (!file) {
          unmatchedList.push({ fileName: mapping.fileName, reason: 'File not found in upload' });
          continue;
        }

        const member = await this.prisma.member.findUnique({
          where: { memberId: mapping.memberId },
        });
        if (!member) {
          unmatchedList.push({
            fileName: mapping.fileName,
            reason: `Member ${mapping.memberId} not found`,
          });
        } else if (member.status !== 'ACTIVE') {
          unmatchedList.push({
            fileName: mapping.fileName,
            reason: `Member ${mapping.memberId} is not ACTIVE`,
          });
        } else {
          matchedStatements.push({
            memberId: member.id,
            realMemberId: member.memberId,
            fileUrl: file.url,
            fileName: file.originalname,
          });
        }
      }
    } else {
      // Convention based: MemberID_Period.ext
      for (const file of files) {
        const parts = file.originalname.split('_');
        if (parts.length < 2) {
          unmatchedList.push({
            fileName: file.originalname,
            reason: 'Filename does not match MemberID_Period convention',
          });
          continue;
        }
        const memberIdStr = parts[0];
        const member = await this.prisma.member.findUnique({ where: { memberId: memberIdStr } });
        if (!member) {
          unmatchedList.push({
            fileName: file.originalname,
            reason: `Member ${memberIdStr} not found`,
          });
        } else if (member.status !== 'ACTIVE') {
          unmatchedList.push({
            fileName: file.originalname,
            reason: `Member ${memberIdStr} is not ACTIVE`,
          });
        } else {
          matchedStatements.push({
            memberId: member.id,
            realMemberId: member.memberId,
            fileUrl: file.url,
            fileName: file.originalname,
          });
        }
      }
    }

    const batch = await this.prisma.statementBatch.create({
      data: {
        adminId,
        period: dto.period,
        category: dto.category,
        matchedCount: matchedStatements.length,
        unmatchedList,
        matchedStatements,
        status: 'PENDING',
      },
    });

    return {
      batchId: batch.id,
      matchedCount: batch.matchedCount,
      unmatchedList: batch.unmatchedList,
    };
  }

  async publishBatch(batchId: string, adminId: string) {
    const batch = await this.prisma.statementBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    if (batch.status === 'PUBLISHED') {
      throw new BadRequestException('Batch is already published');
    }

    const matchedStatements = batch.matchedStatements as any[];

    // Create statements in transaction
    await this.prisma.$transaction(async (tx) => {
      for (const st of matchedStatements) {
        await tx.statement.create({
          data: {
            memberId: st.memberId,
            period: batch.period,
            category: batch.category,
            fileUrl: st.fileUrl,
            status: 'PUBLISHED',
            uploadedById: adminId,
          },
        });
      }

      await tx.statementBatch.update({
        where: { id: batchId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      // Log activity
      await tx.activityLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_BATCH_PUBLISHED',
          entityType: 'StatementBatch',
          entityId: batchId,
          meta: { matchedCount: batch.matchedCount, period: batch.period },
        },
      });
    });

    // Fire notifications (fire and forget)
    for (const st of matchedStatements) {
      this.notificationService
        .sendStatementPublishedNotification(st.memberId, batch.period)
        .catch((e) => {
          this.logger.error(`Failed to send notification for statement: ${e.message}`);
        });
    }

    return { success: true, publishedCount: batch.matchedCount };
  }

  async replaceStatement(id: string, adminId: string, dto: ReplaceStatementDto) {
    const oldStatement = await this.prisma.statement.findUnique({ where: { id } });
    if (!oldStatement) {
      throw new NotFoundException('Statement not found');
    }

    const newStatement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.statement.create({
        data: {
          memberId: oldStatement.memberId,
          period: oldStatement.period,
          category: oldStatement.category,
          fileUrl: dto.fileUrl,
          status: 'PUBLISHED',
          uploadedById: adminId,
          supersedesId: oldStatement.id,
        },
      });

      await tx.statement.update({
        where: { id },
        data: { status: 'SUPERSEDED' },
      });

      await tx.activityLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_REPLACED',
          entityType: 'Statement',
          entityId: id,
          meta: { reason: dto.reason, newStatementId: created.id },
        },
      });

      return created;
    });

    return newStatement;
  }

  async withdrawStatement(id: string, adminId: string, dto: WithdrawStatementDto) {
    const statement = await this.prisma.statement.findUnique({ where: { id } });
    if (!statement) {
      throw new NotFoundException('Statement not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.statement.update({
        where: { id },
        data: { status: 'WITHDRAWN' },
      });

      await tx.activityLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_WITHDRAWN',
          entityType: 'Statement',
          entityId: id,
          meta: { reason: dto.reason },
        },
      });

      return res;
    });

    return updated;
  }

  async findBatches(query: any) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.statementBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.statementBatch.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAdminStatements(query: StatementQueryDto) {
    const { page = 1, limit = 10, memberId, period, category, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (memberId) {
      const member = await this.prisma.member.findUnique({ where: { memberId } });
      if (member) {
        where.memberId = member.id;
      } else {
        return { data: [], total: 0, page, limit };
      }
    }
    if (period) where.period = period;
    if (category) where.category = category;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.statement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { member: { select: { memberId: true, fullName: true } } },
      }),
      this.prisma.statement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findMemberStatements(memberId: string, query: StatementQueryDto) {
    const { page = 1, limit = 10, period, category } = query;
    const skip = (page - 1) * limit;

    const member = await this.prisma.member.findUnique({ where: { memberId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const where: any = {
      memberId: member.id,
      status: 'PUBLISHED',
    };
    if (period) where.period = period;
    if (category) where.category = category;

    const [data, total] = await Promise.all([
      this.prisma.statement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.statement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getMemberStatementFileUrl(statementId: string, authMemberId: string) {
    const statement = await this.prisma.statement.findUnique({
      where: { id: statementId },
      include: { member: true },
    });

    if (!statement) {
      throw new NotFoundException('Statement not found');
    }

    if (statement.member.memberId !== authMemberId) {
      throw new ForbiddenException('You do not have access to this statement');
    }

    if (statement.status !== 'PUBLISHED') {
      throw new ForbiddenException('This statement is not available');
    }

    return statement.fileUrl;
  }
}
