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

export type UserType = 'ADMIN' | 'MEMBER';

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
  async findUserByIdentifier(identifier: string): Promise<{ user: any; type: UserType } | null> {
    if (identifier.includes('@')) {
      const admin = await this.prisma.adminUser.findUnique({ where: { email: identifier } });
      if (admin) return { user: admin, type: 'ADMIN' };
    } else {
      let member = await this.prisma.member.findUnique({ where: { mobile: identifier } });
      if (!member) {
        member = await this.prisma.member.findUnique({ where: { memberId: identifier } });
      }
      if (member) return { user: member, type: 'MEMBER' };
    }
    return null;
  }

  /**
   * Checks if a user is currently locked out.
   */
  private checkLockStatus(user: any) {
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
  ): Promise<{ tempToken: string; isFirstLogin: boolean }> {
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

    // Success! Clear attempts, generate OTP
    await this.clearFailedAttempts(user.id, type);
    await this.otpService.generateAndSendOtp(identifier, OtpType.LOGIN);

    const tempToken = this.jwtService.sign(
      { sub: user.id, type: 'OTP_VERIFY', userType: type },
      { expiresIn: '5m' },
    );

    return { tempToken, isFirstLogin: user.isFirstLogin };
  }

  async verifyOtp(tempToken: string, otp: string): Promise<{ accessToken: string }> {
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

      // Validate OTP. Note: We use the identifier that was generated with OTP.
      // But OTP was generated with identifier from login. Let's use the identifier from the DB.
      const identifier =
        userType === 'ADMIN' ? (user as any).email : (user as any).mobile || (user as any).memberId;

      try {
        await this.otpService.validateOtp(identifier, OtpType.LOGIN, otp);
      } catch (error) {
        await this.handleFailedAttempt(user.id, userType, user.failedAttempts);
      }

      await this.clearFailedAttempts(user.id, userType);

      const accessPayload: JwtPayload = {
        sub: user.id,
        userType,
        role: (user as any).role,
        version: user.sessionVersion,
      };

      return {
        accessToken: this.jwtService.sign(accessPayload),
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

    await this.otpService.generateAndSendOtp(identifier, OtpType.FORGOT_PASSWORD);

    const tempToken = this.jwtService.sign(
      { sub: userResult.user.id, type: 'PASSWORD_RESET', userType: userResult.type },
      { expiresIn: '5m' },
    );

    return { tempToken };
  }

  async resetPassword(tempToken: string, otp: string, newPassword: string): Promise<void> {
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

      const identifier =
        userType === 'ADMIN' ? (user as any).email : (user as any).mobile || (user as any).memberId;

      try {
        await this.otpService.validateOtp(identifier, OtpType.FORGOT_PASSWORD, otp);
      } catch (error) {
        await this.handleFailedAttempt(user.id, userType, user.failedAttempts);
      }

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
}
