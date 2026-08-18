import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/types/auth.types.js';

/**
 * Pulls the authenticated user off the Express request.
 *
 * Populated by JwtAuthGuard / Passport after JWT validation.
 *
 * @example
 * @Get('me')
 * getProfile(@CurrentUser() user: AuthenticatedUser) { return user; }
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user as AuthenticatedUser;
});
