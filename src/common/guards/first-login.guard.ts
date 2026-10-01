import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_FIRST_LOGIN_KEY } from '../decorators/index.js';
import type { AuthenticatedUser } from '../../auth/types/auth.types.js';

/**
 * Global guard (runs after JwtAuthGuard): an account that still has the society-issued
 * initial password (`isFirstLogin`) may only call routes marked @AllowFirstLogin()
 * — profile, change-password and logout — until the password has been changed.
 *
 * Public routes have no `req.user`, so they pass straight through.
 */
@Injectable()
export class FirstLoginGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user as AuthenticatedUser | undefined;

    if (!user?.isFirstLogin) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_FIRST_LOGIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowed) {
      return true;
    }

    throw new ForbiddenException('Password change required before continuing.');
  }
}
