import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OtpType } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a 6-digit OTP, hashes it, stores it with a 5 min expiry, and sends it via a stubbed interface.
   * @param identifier phone, email, or memberNumber
   * @param type LOGIN or FORGOT_PASSWORD
   */
  async generateAndSendOtp(identifier: string, type: OtpType): Promise<void> {
    // Generate a secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Hash it before storing
    const otpHash = await bcrypt.hash(otp, 10);

    // 5 minutes expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store in DB
    await this.prisma.authOtp.create({
      data: {
        identifier,
        otpHash,
        type,
        expiresAt,
      },
    });

    // Send via stubbed interface
    await this.sendOtpStub(identifier, otp);
  }

  /**
   * Stubs the actual gateway call to send an OTP via SMS or Email.
   * This logic will be replaced by the real gateway implementation in Section 12.
   */
  private async sendOtpStub(identifier: string, otp: string): Promise<void> {
    // In a real app, integrate with Twilio / AWS SES etc.
    console.log(`[OTP Stub] Sending OTP ${otp} to ${identifier}`);
  }

  /**
   * Validates the provided OTP for a specific identifier and type.
   * If invalid or expired, throws an exception.
   * On success, deletes the OTP record.
   * Returns a boolean indicating if it was valid, or throws.
   */
  async validateOtp(identifier: string, type: OtpType, otp: string): Promise<boolean> {
    // Find the latest active OTP for this identifier and type
    const otpRecord = await this.prisma.authOtp.findFirst({
      where: {
        identifier,
        type,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // OTP is valid, invalidate it so it can't be reused
    await this.prisma.authOtp.delete({ where: { id: otpRecord.id } });

    return true;
  }
}
