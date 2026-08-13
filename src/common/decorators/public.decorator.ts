import { SetMetadata } from '@nestjs/common';

/** Metadata key checked by JwtAuthGuard to skip authentication. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as publicly accessible — JwtAuthGuard will skip JWT
 * validation for any handler decorated with @Public().
 *
 * Use for: health checks, public interest calculators, login endpoints.
 *
 * @example
 * @Public()
 * @Get('health')
 * health() { return 'ok'; }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
