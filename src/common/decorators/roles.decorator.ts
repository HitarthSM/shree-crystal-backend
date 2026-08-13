import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

/** Metadata key used by RolesGuard to read required roles. */
export const ROLES_KEY = 'roles';

/**
 * Attaches required admin roles to a route handler or controller.
 *
 * @example
 * @Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR)
 * @Get('sensitive-endpoint')
 * sensitiveEndpoint() { ... }
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
