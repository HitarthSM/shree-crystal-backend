import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, UserType } from './types/auth.types.js';

/** Claims signed into every access/refresh token (see AuthService). */
interface TokenClaims {
  sub?: string;
  userType?: UserType;
  version?: number;
  type?: 'ACCESS' | 'REFRESH';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: TokenClaims): Promise<AuthenticatedUser> {
    const { sub, userType, version, type } = payload;

    if (!sub || !userType || version === undefined) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Refresh tokens share the signing key and claims; they must never act as access tokens.
    if (type === 'REFRESH') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: sub } })
        : await this.prisma.member.findUnique({ where: { id: sub } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Deactivated admins / suspended members lose access immediately, not at token expiry.
    const active = 'isActive' in user ? user.isActive : user.status === 'ACTIVE';
    if (!active) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check session version to invalidate old sessions
    if (user.sessionVersion !== version) {
      throw new UnauthorizedException('Session invalidated');
    }

    return {
      userId: user.id,
      userType,
      role: 'role' in user ? user.role : undefined,
      ...user,
    } as AuthenticatedUser;
  }
}
