import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AdminRole } from '../enums/index.js';

/**
 * Member ownership guard — enforces the invariant that a member can NEVER
 * access another member's data.
 *
 * Behaviour:
 * - Admin users (any value in AdminRole enum) bypass the check entirely —
 *   they are permitted to operate on any member's resources.
 * - For member-facing routes, compares `req.user.memberId` against the
 *   `memberId` route parameter. Mismatch → 403 ForbiddenException.
 *
 * Apply at the route level (not controller level) to be explicit about which
 * endpoints are member-scoped. This makes it impossible to forget on a new
 * endpoint because the check is opt-in at the handler.
 *
 * @example
 * @UseGuards(JwtAuthGuard, MemberOwnershipGuard)
 * @Get(':memberId/accounts')
 * getAccounts(@Param('memberId') memberId: string) { ... }
 */
@Injectable()
export class MemberOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;

    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    // Admin roles bypass ownership enforcement.
    const adminRoles: string[] = Object.values(AdminRole);
    if (user.role && adminRoles.includes(user.role)) {
      return true;
    }

    // For member-facing requests, the route param must match their own memberId.
    const paramMemberId = request.params['memberId'];

    if (!paramMemberId) {
      // If the route explicitly uses /me, it is self-scoped and safe.
      if (request.route && request.route.path && request.route.path.includes('/me')) {
        return true;
      }

      // No memberId param — guard is misconfigured; fail closed.
      throw new ForbiddenException(
        'Route does not expose a memberId parameter for ownership verification.',
      );
    }

    if (user.memberId !== paramMemberId) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return true;
  }
}
