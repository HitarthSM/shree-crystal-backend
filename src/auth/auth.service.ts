import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { AuditTrailService, AuditActorType } from '../common/audit/audit-trail.service.js';
import { UserType, AuthenticatedUser, AuthAdminUser, AuthMemberUser } from './types/auth.types.js';

interface JwtPayload {
  sub: string;
  userType: UserType;
  role?: string;
  version: number;
  /** AuthSession id: lets logout end just this device and revokes the token at once. */
  sid: string;
  type: 'ACCESS';
}

interface RefreshPayload {
  sub: string;
  userType: UserType;
  version: number;
  sid?: string;
  /** Random per-rotation id; only its hash is stored server-side. */
  jti?: string;
  type: 'REFRESH';
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

// Compared against when the identifier is unknown so response time doesn't reveal
// whether an account exists.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** How long the previous refresh token is still honoured after a rotation. */
const REFRESH_GRACE_MS = 60 * 1000;
const SESSION_ENDED = 'Your session has ended. Please sign in again.';

const hashJti = (jti: string): string => createHash('sha256').update(jti).digest('hex');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equaliser', 10);

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditTrailService,
  ) {}

  /** Security events go to the audit trail. Never pass passwords, tokens or identifiers here. */
  private async recordEvent(
    action: string,
    actor: { id: string; type: AuditActorType },
    meta: Record<string, string | number | boolean> = {},
    ip?: string,
  ): Promise<void> {
    await this.audit.record({
      actorId: actor.id,
      actorType: actor.type,
      action,
      entityType: 'Auth',
      entityId: actor.id === 'anonymous' ? null : actor.id,
      ipAddress: ip ?? null,
      meta,
    });
  }

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
    lockedUntilPrev?: Date | null,
  ) {
    // A lock that has already expired starts a fresh count; otherwise the very next
    // wrong password after the lock lifts would re-lock the account immediately.
    const lockExpired = !!lockedUntilPrev && lockedUntilPrev <= new Date();
    // Increment in the database so parallel wrong guesses cannot race past the limit.
    const data = lockExpired
      ? { failedAttempts: 1, lockedUntil: null }
      : { failedAttempts: { increment: 1 } };
    const select = { failedAttempts: true };

    const updated =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.update({ where: { id: userId }, data, select })
        : await this.prisma.member.update({ where: { id: userId }, data, select });

    if (updated.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + this.LOCK_TIME_MS);
      if (userType === 'ADMIN') {
        await this.prisma.adminUser.update({ where: { id: userId }, data: { lockedUntil } });
      } else {
        await this.prisma.member.update({ where: { id: userId }, data: { lockedUntil } });
      }
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

  private signTokens(
    userId: string,
    userType: UserType,
    role: string | undefined,
    version: number,
    sid: string,
    jti: string,
  ): IssuedTokens {
    const accessPayload: JwtPayload = {
      sub: userId,
      userType,
      role,
      version,
      sid,
      type: 'ACCESS',
    };
    const refreshPayload: RefreshPayload = {
      sub: userId,
      userType,
      version,
      sid,
      jti,
      type: 'REFRESH',
    };
    return {
      accessToken: this.jwtService.sign(accessPayload),
      refreshToken: this.jwtService.sign(refreshPayload, { expiresIn: '30d' }),
    };
  }

  /** Starts a per-device session and returns its first token pair. */
  private async createSession(
    userId: string,
    userType: UserType,
    role: string | undefined,
    version: number,
  ): Promise<IssuedTokens> {
    const jti = randomUUID();
    const session = await this.prisma.authSession.create({
      data: {
        ...(userType === 'ADMIN' ? { adminUserId: userId } : { memberId: userId }),
        jtiHash: hashJti(jti),
        userVersion: version,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
      select: { id: true },
    });
    return this.signTokens(userId, userType, role, version, session.id, jti);
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async login(
    identifier: string,
    pass: string,
    ip?: string,
  ): Promise<IssuedTokens & { isFirstLogin: boolean }> {
    const userResult = await this.findUserByIdentifier(identifier);
    if (!userResult) {
      await bcrypt.compare(pass, DUMMY_PASSWORD_HASH);
      await this.recordEvent(
        'LOGIN_FAILED',
        { id: 'anonymous', type: 'ANONYMOUS' },
        { reason: 'UNKNOWN_ACCOUNT' },
        ip,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, type } = userResult;
    const actor = { id: user.id, type };
    try {
      this.checkLockStatus(user);
    } catch (error) {
      await this.recordEvent('LOGIN_BLOCKED', actor, { reason: 'LOCKED' }, ip);
      throw error;
    }

    const isMatch = user.passwordHash ? await bcrypt.compare(pass, user.passwordHash) : false;
    if (!isMatch) {
      await this.recordEvent('LOGIN_FAILED', actor, { reason: 'BAD_PASSWORD' }, ip);
      await this.handleFailedAttempt(user.id, type, user.lockedUntil);
    }

    // Only reveal the account state once the password has been proven.
    if (!this.isAccountActive(user, type)) {
      await this.recordEvent('LOGIN_BLOCKED', actor, { reason: 'INACTIVE' }, ip);
      throw new UnauthorizedException(
        'This account is not active. Please contact the society office.',
      );
    }

    await this.clearFailedAttempts(user.id, type);

    const tokens = await this.createSession(user.id, type, user.role, user.sessionVersion);
    await this.recordEvent('LOGIN_SUCCESS', actor, {}, ip);
    return { ...tokens, isFirstLogin: user.isFirstLogin };
  }

  async changePassword(
    userId: string,
    userType: UserType,
    currentPass: string,
    newPass: string,
    ip?: string,
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

    // One transaction: a new password must never exist alongside sessions that were meant to die.
    const updatePassword =
      userType === 'ADMIN'
        ? this.prisma.adminUser.update({
            where: { id: userId },
            data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
            select: { id: true },
          })
        : this.prisma.member.update({
            where: { id: userId },
            data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
            select: { id: true },
          });
    const revokeSessions = this.prisma.authSession.updateMany({
      where: userType === 'ADMIN' ? { adminUserId: userId } : { memberId: userId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.$transaction([updatePassword, revokeSessions]);

    // Bumping sessionVersion invalidated every existing token, including the caller's,
    // so hand back a fresh pair for the device that made the change.
    const role = userType === 'ADMIN' ? (user as AuthAdminUser).role : undefined;
    await this.recordEvent('PASSWORD_CHANGED', { id: userId, type: userType }, {}, ip);
    return this.createSession(userId, userType, role, newVersion);
  }

  /**
   * Ends this device's session. Tokens issued before per-device sessions existed carry
   * no session id; for those the only way to revoke is bumping sessionVersion (all devices).
   */
  async logout(userId: string, userType: UserType, sessionId?: string, ip?: string): Promise<void> {
    await this.recordEvent('LOGOUT', { id: userId, type: userType }, {}, ip);
    if (sessionId) {
      await this.revokeSession(sessionId);
      return;
    }

    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: userId } })
        : await this.prisma.member.findUnique({ where: { id: userId } });

    if (!user) throw new UnauthorizedException();

    const data = { sessionVersion: user.sessionVersion + 1 };
    if (userType === 'ADMIN') {
      await this.prisma.adminUser.update({ where: { id: userId }, data });
    } else {
      await this.prisma.member.update({ where: { id: userId }, data });
    }
  }

  async refresh(refreshToken: string, ip?: string): Promise<IssuedTokens> {
    let payload: RefreshPayload;
    try {
      payload = this.jwtService.verify<RefreshPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'REFRESH') {
      throw new BadRequestException('Invalid refresh token');
    }

    // Tokens from before per-device sessions have no sid/jti; they must sign in again.
    if (!payload.sid || !payload.jti) {
      throw new UnauthorizedException(SESSION_ENDED);
    }

    // Database errors below are deliberately NOT turned into 401s: clients end the session
    // on 401, and an outage must not sign everyone out.
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

    const presented = hashJti(payload.jti);

    // A few attempts: a parallel refresh may rotate the session between our read and our swap.
    for (let attempt = 0; attempt < 3; attempt++) {
      const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException(SESSION_ENDED);
      }

      const isCurrent = session.jtiHash === presented;
      // The previous token stays valid briefly: its replacement may have been lost in transit,
      // or another tab / request may have refreshed first.
      const inGrace =
        !isCurrent &&
        session.prevJtiHash === presented &&
        !!session.rotatedAt &&
        Date.now() - session.rotatedAt.getTime() <= REFRESH_GRACE_MS;

      // Anything else is an older, already-superseded token: it was copied, so end the session.
      if (!isCurrent && !inGrace) {
        await this.revokeSession(session.id);
        await this.recordEvent(
          'TOKEN_REUSE_DETECTED',
          session.adminUserId
            ? { id: session.adminUserId, type: 'ADMIN' }
            : { id: session.memberId ?? 'unknown', type: 'MEMBER' },
          { sessionId: session.id },
          ip,
        );
        throw new UnauthorizedException(SESSION_ENDED);
      }

      const newJti = randomUUID();
      // Compare-and-swap on the current jti so only one concurrent refresh rotates it.
      const rotated = await this.prisma.authSession.updateMany({
        where: { id: session.id, jtiHash: session.jtiHash, revokedAt: null },
        data: {
          prevJtiHash: session.jtiHash,
          rotatedAt: new Date(),
          jtiHash: hashJti(newJti),
          lastUsedAt: new Date(),
          userVersion: user.sessionVersion,
        },
      });

      if (rotated.count === 1) {
        const role = 'role' in user ? user.role : undefined;
        return this.signTokens(
          user.id,
          payload.userType,
          role,
          user.sessionVersion,
          session.id,
          newJti,
        );
      }
    }

    throw new UnauthorizedException(SESSION_ENDED);
  }
}
