import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

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

  async validate(payload: any) {
    // payload should have { sub, userType, version }
    const { sub, userType, version } = payload;

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
      role: (user as any).role,
      ...user,
    };
  }
}
