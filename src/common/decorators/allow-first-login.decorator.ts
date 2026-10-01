import { SetMetadata } from '@nestjs/common';

/** Metadata key read by FirstLoginGuard. */
export const ALLOW_FIRST_LOGIN_KEY = 'allowFirstLogin';

/**
 * Lets a route be called while the account still has `isFirstLogin = true`.
 * Every other authenticated route is blocked until the password has been changed.
 */
export const AllowFirstLogin = () => SetMetadata(ALLOW_FIRST_LOGIN_KEY, true);
