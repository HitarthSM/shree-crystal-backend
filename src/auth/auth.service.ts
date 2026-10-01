import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserType, AuthenticatedUser, AuthAdminUser, AuthMemberUser } from './types/auth.types.js';

interface JwtPayload {
  sub: string;
  userType: UserType;
  role?: string;
  version: number;
  type: 'ACCESS';
}

interface RefreshPayload {
  sub: string;
  userType: UserType;
  version: number;
  type: 'REFRESH';
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

// Compared against when the identifier is unknown so response time doesn't reveal
// whether an account exists.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equaliser', 10);

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Find a user (either Admin or Member) by identifier.
   * Admin uses email. Member uses phone or memberNumber.
   * Admin uses email. Member uses mobile or memberNumber.
   */
  async findUserByIdentifier(
    identifier: string,
  ): Promise<{ user: AuthenticatedUser; type: UserType } | null> {
    if (identifier.includes('@')) {
      const admin = await this.prisma.adminUser.findUnique({ where: { email: identifier } });
      if (admin) return { user: admin as unknown as AuthenticatedUser, type: 'ADMIN' };
    } else {
      let member = await this.prisma.member.findUnique({ where: { mobile: identifier } });
      if (!member) {
        member = await this.prisma.member.findUnique({ where: { memberId: identifier } });
      }
      if (member) return { user: member as unknown as AuthenticatedUser, type: 'MEMBER' };
    }
    return null;
  }

  /**
   * Checks if a user is currently locked out.
   */
  private checkLockStatus(user: { lockedUntil?: Date | null }) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is temporarily locked due to too many failed attempts.',
      );
    }
  }

  /**
   * Updates the failed attempts for a user. Locks the account if limit reached.
   */
  private async handleFailedAttempt(
    userId: string,
    userType: UserType,
    currentFailedAttempts: number,
    lockedUntilPrev?: Date | null,
  ) {
    // A lock that has already expired starts a fresh count; otherwise the very next
    // wrong password after the lock lifts would re-lock the account immediately.
    const lockExpired = !!lockedUntilPrev && lockedUntilPrev <= new Date();
    const newAttempts = (lockExpired ? 0 : currentFailedAttempts) + 1;
    let lockedUntil = null;

    if (newAttempts >= this.MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + this.LOCK_TIME_MS);
    }

    if (userType === 'ADMIN') {
      await this.prisma.adminUser.update({
        where: { id: userId },
        data: { failedAttempts: newAttempts, lockedUntil },
      });
    } else {
      await this.prisma.member.update({
        where: { id: userId },
        data: { failedAttempts: newAttempts, lockedUntil },
      });
    }

    if (lockedUntil) {
      throw new UnauthorizedException('Account locked due to 5 consecutive failed attempts.');
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  /**
   * Clears the failed attempts for a user upon successful login.
   */
  private async clearFailedAttempts(userId: string, userType: UserType) {
    if (userType === 'ADMIN') {
      await this.prisma.adminUser.update({
        where: { id: userId },
        data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
    } else {
      await this.prisma.member.update({
        where: { id: userId },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }
  }

  /** Admins need isActive; members need ACTIVE status. */
  private isAccountActive(user: AuthenticatedUser, type: UserType): boolean {
    if (type === 'ADMIN') return (user as AuthAdminUser).isActive;
    return (user as AuthMemberUser).status === 'ACTIVE';
  }

  private issueTokens(
    userId: string,
    userType: UserType,
    role: string | undefined,
    version: number,
  ): IssuedTokens {
    const accessPayload: JwtPayload = { sub: userId, userType, role, version, type: 'ACCESS' };
    const refreshPayload: RefreshPayload = { sub: userId, userType, version, type: 'REFRESH' };
    return {
      accessToken: this.jwtService.sign(accessPayload),
      refreshToken: this.jwtService.sign(refreshPayload, { expiresIn: '30d' }),
    };
  }

  async login(identifier: string, pass: string): Promise<IssuedTokens & { isFirstLogin: boolean }> {
    const userResult = await this.findUserByIdentifier(identifier);
    if (!userResult) {
      await bcrypt.compare(pass, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, type } = userResult;
    this.checkLockStatus(user);

    const isMatch = user.passwordHash ? await bcrypt.compare(pass, user.passwordHash) : false;
    if (!isMatch) {
      await this.handleFailedAttempt(user.id, type, user.failedAttempts, user.lockedUntil);
    }

    // Only reveal the account state once the password has been proven.
    if (!this.isAccountActive(user, type)) {
      throw new UnauthorizedException(
        'This account is not active. Please contact the society office.',
      );
    }

    await this.clearFailedAttempts(user.id, type);

    const tokens = this.issueTokens(user.id, type, user.role, user.sessionVersion);
    return { ...tokens, isFirstLogin: user.isFirstLogin };
  }

  async changePassword(
    userId: string,
    userType: UserType,
    currentPass: string,
    newPass: string,
  ): Promise<IssuedTokens> {
    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: userId } })
        : await this.prisma.member.findUnique({ where: { id: userId } });

    if (!user) throw new UnauthorizedException();

    const isMatch = user.passwordHash
      ? await bcrypt.compare(currentPass, user.passwordHash)
      : false;
    if (!isMatch) throw new UnauthorizedException('Invalid current password');
    if (currentPass === newPass) {
      throw new BadRequestException('New password must be different from the current password');
    }

    const passwordHash = await bcrypt.hash(newPass, 10);
    const newVersion = user.sessionVersion + 1;

    if (userType === 'ADMIN') {
      await this.prisma.adminUser.update({
        where: { id: userId },
        data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
      });
    } else {
      await this.prisma.member.update({
        where: { id: userId },
        data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
      });
    }

    // Bumping sessionVersion invalidated every existing token, including the caller's,
    // so hand back a fresh pair for the device that made the change.
    const role = userType === 'ADMIN' ? (user as AuthAdminUser).role : undefined;
    return this.issueTokens(userId, userType, role, newVersion);
  }

  async logout(userId: string, userType: UserType): Promise<void> {
    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: userId } })
        : await this.prisma.member.findUnique({ where: { id: userId } });

    if (!user) throw new UnauthorizedException();

    const newVersion = user.sessionVersion + 1;

    if (userType === 'ADMIN') {
      await this.prisma.adminUser.update({
        where: { id: userId },
        data: { sessionVersion: newVersion },
      });
    } else {
      await this.prisma.member.update({
        where: { id: userId },
        data: { sessionVersion: newVersion },
      });
    }
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    try {
      const payload = this.jwtService.verify<RefreshPayload>(refreshToken);

      if (payload.type !== 'REFRESH') {
        throw new BadRequestException('Invalid refresh token');
      }

      const user =
        payload.userType === 'ADMIN'
          ? await this.prisma.adminUser.findUnique({ where: { id: payload.sub } })
          : await this.prisma.member.findUnique({ where: { id: payload.sub } });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      this.checkLockStatus(user);

      if (!this.isAccountActive(user as unknown as AuthenticatedUser, payload.userType)) {
        throw new UnauthorizedException('Account is not active');
      }

      if (user.sessionVersion !== payload.version) {
        throw new UnauthorizedException('Session invalidated');
      }

      const role = 'role' in user ? user.role : undefined;
      return this.issueTokens(user.id, payload.userType, role, user.sessionVersion);
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof BadRequestException) throw e;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
