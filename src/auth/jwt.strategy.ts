import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, JwtUserPayload } from './types/auth.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'defaultSecretKey',
    });
  }

  async validate(payload: JwtUserPayload): Promise<AuthenticatedUser> {
    // payload should have { sub, userType, version }
    // Actually the token signs { sub, userType, role, version }
    // Our new JwtUserPayload has userId. Let's map it. 
    // Wait, the payload uses 'sub'. Let's stick to reading 'sub' and outputting AuthenticatedUser.
    const sub = (payload as any).sub;
    const { userType, version } = payload;

    if (!sub || !userType || version === undefined) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: sub } })
        : await this.prisma.member.findUnique({ where: { id: sub } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check session version to invalidate old sessions
    if (user.sessionVersion !== version) {
      throw new UnauthorizedException('Session invalidated');
    }

    // Pass the user info to req.user (used by CurrentUser decorator and RolesGuard)
    return {
      userId: user.id,
      userType,
      role: 'role' in user ? user.role : undefined,
      ...user,
    } as AuthenticatedUser;
  }
}
