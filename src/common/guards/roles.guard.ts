import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AdminRole } from '../enums/index.js';
import { ROLES_KEY } from '../decorators/index.js';

/**
 * RBAC guard — checks the @Roles() metadata against the authenticated user's role.
 *
 * Behaviour:
 * - No @Roles() metadata → pass-through (any authenticated user is allowed).
 * - @Roles() present, user's role matches → allowed.
 * - @Roles() present, user's role does NOT match → throws ForbiddenException (403).
 *
 * This guard expects JwtAuthGuard to have already run and attached `req.user`.
 * Always returns 403 (Forbidden), never 401 — 401 is the responsibility of JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required — any authenticated user may proceed.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    if (!user?.role || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return true;
  }
}
