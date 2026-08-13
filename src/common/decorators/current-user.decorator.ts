import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Pulls the authenticated user off the Express request.
 *
 * Populated by JwtAuthGuard / Passport after JWT validation.
 *
 * @example
 * @Get('me')
 * getProfile(@CurrentUser() user: JwtPayload) { return user; }
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user;
});
