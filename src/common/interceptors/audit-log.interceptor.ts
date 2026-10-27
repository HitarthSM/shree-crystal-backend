import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { AuditLogService, AuditActorType } from '../audit/audit-log.service.js';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';

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
 * AuditLogInterceptor writes one audit entry for every mutating request (POST / PUT / PATCH /
 * DELETE), successful or not, and waits for the write before the response goes out.
 *
 * Auth routes are skipped: AuthService records richer, purpose-built events there (login,
 * failed login, logout, token reuse, password change).
 *
 * Request bodies are never logged: they can hold passwords and KYC numbers.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    if (
      !MUTATING_METHODS.has(request.method.toUpperCase()) ||
      context.getClass().name === 'AuthController'
    ) {
      return next.handle();
    }

    const controller = context.getClass().name.replace(/Controller$/, '');

    return next.handle().pipe(
      mergeMap((value: unknown) =>
        from(this.write(request, controller, 'SUCCESS', 200)).pipe(mergeMap(() => [value])),
      ),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        return from(this.write(request, controller, 'FAILURE', status)).pipe(
          mergeMap(() => throwError(() => error)),
        );
      }),
    );
  }

  private write(
    request: Request,
    controller: string,
    outcome: 'SUCCESS' | 'FAILURE',
    statusCode: number,
  ): Promise<void> {
    const user = request.user as AuthenticatedUser | undefined;
    const ctx = request.auditContext ?? {};
    const route = request.route as { path?: string } | undefined;

    const actorType: AuditActorType = user ? user.userType : 'ANONYMOUS';
    const metadata: Prisma.InputJsonObject = {
      outcome,
      statusCode,
      ...(user && 'role' in user && user.role ? { role: user.role } : {}),
      ...(ctx.before !== undefined ? { before: ctx.before } : {}),
      ...(ctx.after !== undefined ? { after: ctx.after } : {}),
    };

    return this.audit.record({
      actorId: user?.userId ?? 'anonymous',
      actorType,
      action: `${request.method.toUpperCase()} ${request.baseUrl}${route?.path ?? request.path}`,
      entityType: ctx.resourceType ?? controller,
      entityId:
        ctx.resourceId ?? (typeof request.params.id === 'string' ? request.params.id : null),
      // request.ip honours the app's "trust proxy" setting; the raw X-Forwarded-For header is client-controlled.
      ipAddress: request.ip ?? null,
      metadata,
    });
  }
}
