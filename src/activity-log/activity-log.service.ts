import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { GetActivityLogDto } from './dto/get-activity-log.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { ActivityLog, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { Response } from 'express';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhereClause(dto: GetActivityLogDto): Prisma.ActivityLogWhereInput {
    const where: Prisma.ActivityLogWhereInput = {};
    if (dto.userId) {
      where.actorId = dto.userId;
    }
    if (dto.actionType) {
      where.action = dto.actionType;
    }
    if (dto.resourceType) {
      where.entityType = dto.resourceType;
    }
    if (dto.startDate || dto.endDate) {
      where.createdAt = {};
      if (dto.startDate) {
        where.createdAt.gte = new Date(dto.startDate);
      }
      if (dto.endDate) {
        where.createdAt.lte = new Date(dto.endDate);
      }
    }
    return where;
  }

  async findAll(dto: GetActivityLogDto): Promise<PaginatedResponseDto<ActivityLog>> {
    const where = this.buildWhereClause(dto);
    const total = await this.prisma.activityLog.count({ where });
    const items = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (dto.page - 1) * dto.limit,
      take: dto.limit,
    });

    return {
      data: items,
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  async exportExcel(dto: GetActivityLogDto, res: Response, currentUser: any): Promise<void> {
    const where = this.buildWhereClause(dto);
    const items = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const exportData = items.map((item) => ({
      ID: item.id,
      'Actor ID': item.actorId,
      'Actor Type': item.actorType,
      Action: item.action,
      'Entity Type': item.entityType,
      'Entity ID': item.entityId || '',
      'IP Address': item.ipAddress || '',
      'Created At': item.createdAt.toISOString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Logs');

    // Explicitly trigger a log entry for this export action
    await this.prisma.activityLog.create({
      data: {
        actorId: currentUser.userId || currentUser.sub || 'UNKNOWN_ADMIN',
        actorType: 'ADMIN',
        action: 'EXPORT_ACTIVITY_LOG',
        entityType: 'ActivityLog',
        meta: JSON.parse(JSON.stringify(dto)),
      },
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + `activity-log-export-${new Date().getTime()}.xlsx`,
    );

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  }
}
