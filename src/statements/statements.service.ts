import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, BatchStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BatchUploadStatementsDto } from './dto/batch-upload-statements.dto.js';
import { ReplaceStatementInput } from './dto/replace-statement.dto.js';
import { WithdrawStatementDto } from './dto/withdraw-statement.dto.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';

@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationsService,
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
          where: { membershipNumber: mapping.membershipNumber },
        });
        if (!member) {
          unmatchedList.push({
            fileName: mapping.fileName,
            reason: `Member ${mapping.membershipNumber} not found`,
          });
        } else if (member.status !== 'ACTIVE') {
          unmatchedList.push({
            fileName: mapping.fileName,
            reason: `Member ${mapping.membershipNumber} is not ACTIVE`,
          });
        } else {
          matchedStatements.push({
            memberId: member.id,
            realMemberId: member.membershipNumber,
            fileUrl: file.url,
            fileName: file.originalname,
          });
        }
      }
    } else {
      // Convention based: Extracts the very first word (before a space or underscore) as MemberID
      for (const file of files) {
        const match = file.originalname.match(/^([A-Za-z0-9-]+)[\s_]/);
        if (!match) {
          unmatchedList.push({
            fileName: file.originalname,
            reason: 'Filename must start with MemberID followed by a space or underscore',
          });
          continue;
        }
        const memberIdStr = match[1];
        const member = await this.prisma.member.findUnique({
          where: { membershipNumber: memberIdStr },
        });
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
            realMemberId: member.membershipNumber,
            fileUrl: file.url,
            fileName: file.originalname,
          });
        }
      }
    }

    const batch = await this.prisma.statementBatch.create({
      data: {
        createdById: adminId,
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

    const matchedStatements =
      (batch.matchedStatements as unknown as Array<{ memberId: string; fileUrl: string }>) || [];

    await this.prisma.$transaction(async (tx) => {
      // Claim the batch first, atomically: of two concurrent publishes only one gets count 1.
      const claim = await tx.statementBatch.updateMany({
        where: { id: batchId, status: 'PENDING' },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Batch is already published');
      }

      // A member must not end up with two live statements for one period. Corrections go through
      // "replace", which supersedes the old one; publishing must not silently do the same.
      const memberIds = matchedStatements.map((st) => st.memberId);
      const existing = await tx.statement.count({
        where: {
          memberId: { in: memberIds },
          period: batch.period,
          category: batch.category,
          status: 'PUBLISHED',
        },
      });
      if (existing > 0) {
        throw new BadRequestException(
          `${existing} member(s) already have a published ${batch.category} statement for ${batch.period}. Use "replace" to correct a statement.`,
        );
      }

      await tx.statement.createMany({
        data: matchedStatements.map((st) => ({
          memberId: st.memberId,
          period: batch.period,
          category: batch.category,
          fileUrl: st.fileUrl,
          status: 'PUBLISHED' as const,
          uploadedById: adminId,
        })),
      });

      // Log activity
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_BATCH_PUBLISHED',
          entityType: 'StatementBatch',
          entityId: batchId,
          metadata: { matchedCount: batch.matchedCount, period: batch.period },
        },
      });
    });

    // Fire notifications (fire and forget)
    for (const st of matchedStatements) {
      this.notificationService
        .sendStatementPublishedNotification(st.memberId, batch.period)
        .catch((e: Error) => {
          this.logger.error(`Failed to send notification for statement: ${e.message}`);
        });
    }

    return { success: true, publishedCount: batch.matchedCount };
  }

  async replaceStatement(id: string, adminId: string, dto: ReplaceStatementInput) {
    const oldStatement = await this.prisma.statement.findUnique({ where: { id } });
    if (!oldStatement) {
      throw new NotFoundException('Statement not found');
    }

    const newStatement = await this.prisma.$transaction(async (tx) => {
      // Only a live statement can be replaced; the claim also stops two concurrent replaces.
      const claim = await tx.statement.updateMany({
        where: { id, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED' },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Only a published statement can be replaced');
      }

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

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_REPLACED',
          entityType: 'Statement',
          entityId: id,
          metadata: { reason: dto.reason, newStatementId: created.id },
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
      const claim = await tx.statement.updateMany({
        where: { id, status: 'PUBLISHED' },
        data: { status: 'WITHDRAWN' },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Only a published statement can be withdrawn');
      }
      const res = await tx.statement.findUniqueOrThrow({ where: { id } });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'STATEMENT_WITHDRAWN',
          entityType: 'Statement',
          entityId: id,
          metadata: { reason: dto.reason },
        },
      });

      return res;
    });

    return updated;
  }

  async findBatches(query: { page?: number; limit?: number; status?: BatchStatus }) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StatementBatchWhereInput = {};
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
    const { page = 1, limit = 10, membershipNumber, period, category, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StatementWhereInput = {};
    if (membershipNumber) {
      const member = await this.prisma.member.findUnique({ where: { membershipNumber } });
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
        include: { member: { select: { membershipNumber: true, fullName: true } } },
      }),
      this.prisma.statement.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findMemberStatements(membershipNumber: string, query: StatementQueryDto) {
    const { page = 1, limit = 10, period, category } = query;
    const skip = (page - 1) * limit;

    const member = await this.prisma.member.findUnique({ where: { membershipNumber } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const where: Prisma.StatementWhereInput = {
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

    if (statement.member.membershipNumber !== authMemberId) {
      throw new ForbiddenException('You do not have access to this statement');
    }

    if (statement.status !== 'PUBLISHED') {
      throw new ForbiddenException('This statement is not available');
    }

    return statement.fileUrl;
  }
}
