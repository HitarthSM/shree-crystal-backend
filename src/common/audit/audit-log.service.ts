import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditActorType = 'ADMIN' | 'MEMBER' | 'ANONYMOUS' | 'SYSTEM';

export interface AuditEvent {
  actorId: string;
  actorType: AuditActorType;
  /** e.g. "LOGIN_FAILED" or "PATCH /members/:id/status" */
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  /** Context such as outcome, status code or before/after snapshots. Never put secrets here. */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Single place that writes the audit trail. The write is awaited so an entry exists before the
 * caller carries on, but a logging failure is reported and swallowed: auditing must not take
 * the application down.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: event.actorId,
          actorType: event.actorType,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          ipAddress: event.ipAddress ?? null,
          metadata: event.metadata ?? {},
        },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit entry ${event.action}`, error);
    }
  }
}
