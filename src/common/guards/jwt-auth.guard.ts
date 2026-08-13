import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/index.js';

/**
 * Global JWT authentication guard.
 *
 * - Checks for the @Public() decorator first; if present, bypasses all JWT
 *   validation and lets the request through immediately.
 * - Otherwise delegates to Passport's 'jwt' strategy (registered in AuthModule)
 *   which validates the Bearer token and attaches the decoded payload to req.user.
 *
 * Apply globally in AppModule or main.ts; individual routes opt-out via @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
