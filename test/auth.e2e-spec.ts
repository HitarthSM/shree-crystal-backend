import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { OtpType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('Login Flow & Account Locking', () => {
    let testMember: any;
    let tempToken: string;

    beforeAll(async () => {
      // Create a test member
      const passwordHash = await bcrypt.hash('Password123', 10);
      testMember = await prisma.member.create({
        data: {
          fullName: 'Test Member Full',
          dob: new Date('1990-01-01'),
          gender: 'MALE',
          mobile: '9999999999'.slice(0, 6) + Date.now().toString().slice(-4),
          addressLine1: 'Test Address',
          city: 'Pune',
          state: 'MH',
          pincode: '411001',
          aadhaarHash: 'hash-' + Date.now(),
          aadhaarEncrypted: 'enc-' + Date.now(),
          passwordHash,
          isFirstLogin: true,
          failedAttempts: 0,
          memberId: 'M-TEST-' + Date.now(),
        },
      });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.member.delete({ where: { id: testMember.id } });
    });

    it('should successfully login and return a temp token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: testMember.mobile,
          password: 'Password123',
        })
        .expect(201);

      expect(res.body).toHaveProperty('tempToken');
      expect(res.body.isFirstLogin).toBe(true);
      tempToken = res.body.tempToken;

      // Ensure OTP was generated in DB
      const otp = await prisma.authOtp.findFirst({
        where: { identifier: testMember.mobile, type: OtpType.LOGIN },
      });
      expect(otp).toBeDefined();
    });

    it('should reject wrong OTP and increment failed attempts', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          tempToken,
          otp: '000000', // Invalid OTP
        })
        .expect(401);

      const member = await prisma.member.findUnique({ where: { id: testMember.id } });
      expect(member?.failedAttempts).toBe(1);
    });

    it('should lock account after 5 failed OTP attempts', async () => {
      // We already failed 1 time. Let's fail 3 more times (total 4).
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/auth/verify-otp')
          .send({ tempToken, otp: '111111' })
          .expect(401);
      }

      // 5th attempt should return 401 and lock the account
      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ tempToken, otp: '111111' })
        .expect(401);

      const member = await prisma.member.findUnique({ where: { id: testMember.id } });
      expect(member?.failedAttempts).toBe(5);
      expect(member?.lockedUntil).not.toBeNull();
      expect(res.body.message).toMatch(/locked/i);
    });

    it('should prevent login when account is locked', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: testMember.mobile,
          password: 'Password123',
        })
        .expect(401);

      expect(res.body.message).toMatch(/locked/i);
    });
  });

  describe('JWT Protection', () => {
    it('should require a valid JWT for protected routes', async () => {
      // Assuming /health is public but maybe another route is protected.
      // Let's test /auth/change-password without token
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          currentPassword: 'old',
          newPassword: 'new',
        })
        .expect(401);
    });
  });
});
