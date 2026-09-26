import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';
import * as bcrypt from 'bcrypt';
import { OtpType } from '@prisma/client';
import { UserType, AuthenticatedUser } from './types/auth.types.js';

interface TempTokenPayload {
  sub: string;
  type: 'OTP_VERIFY' | 'PASSWORD_RESET';
  userType: UserType;
}

interface JwtPayload {
  sub: string;
  userType: UserType;
  role?: string;
  version: number;
}

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpService: OtpService,
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
  ) {
    const newAttempts = currentFailedAttempts + 1;
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
        data: { failedAttempts: 0, lockedUntil: null },
      });
    } else {
      await this.prisma.member.update({
        where: { id: userId },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    }
  }

  async login(
    identifier: string,
    pass: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    tempToken?: string;
    isFirstLogin: boolean;
  }> {
    const userResult = await this.findUserByIdentifier(identifier);
    if (!userResult) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, type } = userResult;
    this.checkLockStatus(user);

    const isMatch = user.passwordHash ? await bcrypt.compare(pass, user.passwordHash) : false;
    if (!isMatch) {
      await this.handleFailedAttempt(user.id, type, user.failedAttempts);
    }

    // Success! Clear attempts
    await this.clearFailedAttempts(user.id, type);

    // Send OTP (Disabled for easy access)
    // await this.otpService.generateAndSendOtp(identifier, OtpType.LOGIN);

    // Generate Temp Token for OTP Verification
    const tempToken = this.jwtService.sign(
      { sub: user.id, type: 'OTP_VERIFY', userType: type },
      { expiresIn: '5m' },
    );

    const accessPayload: JwtPayload = {
      sub: user.id,
      userType: type,
      role: (user as any).role,
      version: user.sessionVersion,
    };
    const accessToken = this.jwtService.sign(accessPayload);

    const refreshPayload = {
      sub: user.id,
      userType: type,
      version: user.sessionVersion,
      type: 'REFRESH',
    };
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: '30d' });

    return { tempToken, accessToken, refreshToken, isFirstLogin: user.isFirstLogin };
  }

  async verifyOtp(
    tempToken: string,
    _otp?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify<TempTokenPayload>(tempToken);
      if (payload.type !== 'OTP_VERIFY') throw new BadRequestException('Invalid token type');

      const userType = payload.userType;
      const user =
        userType === 'ADMIN'
          ? await this.prisma.adminUser.findUnique({ where: { id: payload.sub } })
          : await this.prisma.member.findUnique({ where: { id: payload.sub } });

      if (!user) throw new UnauthorizedException();
      this.checkLockStatus(user);

      // OTP validation bypassed for easy access
      // const identifier =
      //   userType === 'ADMIN' ? (user as any).email : (user as any).mobile || (user as any).memberId;
      // try {
      //   await this.otpService.validateOtp(identifier, OtpType.LOGIN, _otp || '');
      // } catch (error) {
      //   await this.handleFailedAttempt(user.id, userType, user.failedAttempts);
      // }

      await this.clearFailedAttempts(user.id, userType);

      const accessPayload: JwtPayload = {
        sub: user.id,
        userType,
        role: (user as any).role,
        version: user.sessionVersion,
      };

      const refreshPayload = {
        sub: user.id,
        userType,
        version: user.sessionVersion,
        type: 'REFRESH',
      };

      return {
        accessToken: this.jwtService.sign(accessPayload),
        refreshToken: this.jwtService.sign(refreshPayload, { expiresIn: '30d' }),
      };
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof BadRequestException) throw e;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async forgotPassword(identifier: string): Promise<{ tempToken: string }> {
    const userResult = await this.findUserByIdentifier(identifier);
    if (!userResult) {
      // Return a fake token to prevent user enumeration
      return { tempToken: 'fake-token' };
    }

    // OTP disabled for easy access
    // await this.otpService.generateAndSendOtp(identifier, OtpType.FORGOT_PASSWORD);

    const tempToken = this.jwtService.sign(
      { sub: userResult.user.id, type: 'PASSWORD_RESET', userType: userResult.type },
      { expiresIn: '5m' },
    );

    return { tempToken };
  }

  async resetPassword(tempToken: string, _otp: string, newPassword: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<TempTokenPayload>(tempToken);
      if (payload.type !== 'PASSWORD_RESET') throw new BadRequestException('Invalid token type');

      const userType = payload.userType;
      const user =
        userType === 'ADMIN'
          ? await this.prisma.adminUser.findUnique({ where: { id: payload.sub } })
          : await this.prisma.member.findUnique({ where: { id: payload.sub } });

      if (!user) throw new UnauthorizedException();
      this.checkLockStatus(user);

      // OTP validation bypassed for easy access
      // const identifier =
      //   userType === 'ADMIN' ? (user as any).email : (user as any).mobile || (user as any).memberId;
      // try {
      //   await this.otpService.validateOtp(identifier, OtpType.FORGOT_PASSWORD, _otp);
      // } catch (error) {
      //   await this.handleFailedAttempt(user.id, userType, user.failedAttempts);
      // }

      await this.clearFailedAttempts(user.id, userType);

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const newVersion = user.sessionVersion + 1;

      if (userType === 'ADMIN') {
        await this.prisma.adminUser.update({
          where: { id: user.id },
          data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
        });
      } else {
        await this.prisma.member.update({
          where: { id: user.id },
          data: { passwordHash, sessionVersion: newVersion, isFirstLogin: false },
        });
      }
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof BadRequestException) throw e;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async changePassword(
    userId: string,
    userType: UserType,
    currentPass: string,
    newPass: string,
  ): Promise<void> {
    const user =
      userType === 'ADMIN'
        ? await this.prisma.adminUser.findUnique({ where: { id: userId } })
        : await this.prisma.member.findUnique({ where: { id: userId } });

    if (!user) throw new UnauthorizedException();

    const isMatch = user.passwordHash
      ? await bcrypt.compare(currentPass, user.passwordHash)
      : false;
    if (!isMatch) throw new UnauthorizedException('Invalid current password');

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

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        userType: UserType;
        version: number;
        type: string;
      }>(refreshToken);

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

      if (user.sessionVersion !== payload.version) {
        throw new UnauthorizedException('Session invalidated');
      }

      const accessPayload: JwtPayload = {
        sub: user.id,
        userType: payload.userType,
        role: (user as any).role,
        version: user.sessionVersion,
      };

      const newRefreshPayload = {
        sub: user.id,
        userType: payload.userType,
        version: user.sessionVersion,
        type: 'REFRESH',
      };

      return {
        accessToken: this.jwtService.sign(accessPayload),
        refreshToken: this.jwtService.sign(newRefreshPayload, { expiresIn: '30d' }),
      };
    } catch (e) {
      if (e instanceof UnauthorizedException || e instanceof BadRequestException) throw e;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
