import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service.js';

/** Mutating HTTP methods that trigger audit entries. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Optional per-request audit context that route handlers can populate to
 * enrich the log entry with resource information and before/after snapshots.
 *
 * Set via:  req.auditContext = { resourceType: 'Member', resourceId: id, before, after };
 */
export interface AuditContext {
  resourceType?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
}

// Extend Express Request type locally so TypeScript is happy.
declare module 'express' {
  interface Request {
    auditContext?: AuditContext;
  }
}

/**
 * AuditLogInterceptor — fires after every successful mutating request
 * (POST / PUT / PATCH / DELETE) and writes a structured audit entry.
 *
 * Entry shape:
 *   actorId, actorRole, action (METHOD /path), resourceType, resourceId,
 *   ipAddress, timestamp, before (snapshot), after (snapshot).
 *
 * Wired globally in main.ts. Never breaks the response — all DB errors are
 * caught and logged to console.error only.
 *
 * The AuditLog Prisma model is optional: if it doesn't exist yet, writes
 * are skipped gracefully and the entry is only console-logged.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // Fire-and-forget — intentionally not awaited so we never slow the response.
          void this.writeAuditLog(request);
        },
      }),
    );
  }

  private async writeAuditLog(request: Request): Promise<void> {
    try {
      const user = request.user as any;

      const actorId: string = user?.id ?? user?.memberId ?? 'anonymous';
      const actorRole: string = user?.role ?? 'unknown';
      const action = `${request.method.toUpperCase()} ${request.path}`;
      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        request.socket.remoteAddress ??
        'unknown';

      const ctx = request.auditContext ?? {};

      const entry = {
        actorId,
        actorType: actorRole.toUpperCase() === 'MEMBER' ? 'MEMBER' : 'ADMIN',
        action,
        entityType: ctx.resourceType ?? 'unknown',
        entityId: ctx.resourceId ?? null,
        ipAddress,
        meta: {
          ...(ctx.before !== undefined && { before: ctx.before }),
          ...(ctx.after !== undefined && { after: ctx.after }),
        },
      };

      if (typeof (this.prisma as any).activityLog?.create === 'function') {
        await (this.prisma as any).activityLog.create({ data: entry });
      } else {
        this.logger.log(`[AUDIT] ${JSON.stringify(entry)}`);
      }
    } catch (err) {
      // Never let audit logging break the application.
      this.logger.error('Failed to write audit log entry', err);
    }
  }
}
