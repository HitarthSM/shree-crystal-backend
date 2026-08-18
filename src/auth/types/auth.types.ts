import { AdminUser, Member, AdminRole } from '@prisma/client';

export type UserType = 'ADMIN' | 'MEMBER';

export interface JwtUserPayload {
  userId: string;
  userType: UserType;
  role?: AdminRole;
  version: number;
}

export type AuthAdminUser = AdminUser & JwtUserPayload;
export type AuthMemberUser = Member & JwtUserPayload;

export type AuthenticatedUser = AuthAdminUser | AuthMemberUser;
