import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OtpType, QueryStatus } from '@prisma/client';

describe('Security and Access Control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let memberA: any;
  let memberB: any;
  let adminUser: any;

  let memberAToken: string;
  let memberBToken: string;

  let queryA: any;
  let statementA: any;
  let pendingActionA: any; // e.g. a change request if we can mock one, but wait, change-requests is a GET in MembersController which is admin only, or MembersMeController?

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    const passwordHash = await bcrypt.hash('Password123', 10);

    adminUser = await prisma.adminUser.create({
      data: {
        email: `admin.sec.${Date.now()}@example.com`,
        name: 'Sec Admin',
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    });

    // Create Member A
    memberA = await prisma.member.create({
      data: {
        memberId: 'M-TESTA-' + Date.now(),
        fullName: 'Member A Full',
        dob: new Date('1990-01-01'),
        gender: 'MALE',
        addressLine1: 'Test Address',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        aadhaarHash: 'hashA-' + Date.now(),
        aadhaarEncrypted: 'encA-' + Date.now(),
        mobile: '999999' + Date.now().toString().slice(-4),
        passwordHash,
        isFirstLogin: false,
        failedAttempts: 0,
      },
    });

    // Create Member B
    memberB = await prisma.member.create({
      data: {
        memberId: 'M-TESTB-' + Date.now(),
        fullName: 'Member B Full',
        dob: new Date('1990-01-01'),
        gender: 'FEMALE',
        addressLine1: 'Test Address',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        aadhaarHash: 'hashB-' + Date.now(),
        aadhaarEncrypted: 'encB-' + Date.now(),
        mobile: '888888' + Date.now().toString().slice(-4),
        passwordHash,
        isFirstLogin: false,
        failedAttempts: 0,
      },
    });

    // Create tokens
    memberAToken = jwtService.sign({
      sub: memberA.id,
      userType: 'MEMBER',
      version: memberA.sessionVersion,
    });

    memberBToken = jwtService.sign({
      sub: memberB.id,
      userType: 'MEMBER',
      version: memberB.sessionVersion,
    });

    // Create mock resources for Member A
    queryA = await prisma.supportQuery.create({
      data: {
        memberId: memberA.id,
        subject: 'Test Query A',
        messages: {
          create: {
            message: 'This belongs to A',
            senderType: 'MEMBER',
            senderId: memberA.id,
          },
        },
        status: 'OPEN',
      },
    });

    statementA = await prisma.statement.create({
      data: {
        memberId: memberA.id,
        period: 'Q3 2026',
        fileUrl: 'http://example.com/statementA.pdf',
        category: 'QUARTERLY',
        uploadedById: adminUser.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.statement.deleteMany({
      where: { memberId: { in: [memberA?.id, memberB?.id].filter(Boolean) } },
    });
    await prisma.queryMessage.deleteMany({
      where: { senderId: { in: [memberA?.id, memberB?.id].filter(Boolean) } },
    });
    await prisma.supportQuery.deleteMany({
      where: { memberId: { in: [memberA?.id, memberB?.id].filter(Boolean) } },
    });
    await prisma.member.deleteMany({
      where: { id: { in: [memberA?.id, memberB?.id].filter(Boolean) } },
    });
    if (adminUser?.id) await prisma.adminUser.deleteMany({ where: { id: adminUser.id } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('1. Unauthenticated Access', () => {
    it('should return 401 when hitting a protected endpoint without JWT', async () => {
      await request(app.getHttpServer()).get('/activity-log').expect(401);
    });
  });

  describe('2. Role-based Access Control', () => {
    it('should return 403 (not 401) when authenticated member hits an admin-only endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/activity-log')
        .set('Authorization', `Bearer ${memberAToken}`)
        .expect(403);

      expect(res.body.message).toMatch(/Forbidden resource|permission/i);
    });
  });

  describe('3. Cross-Member Access Protection', () => {
    it("should reject Member B from accessing Member A's query", async () => {
      const res = await request(app.getHttpServer())
        .get(`/queries/me/${queryA.id}`)
        .set('Authorization', `Bearer ${memberBToken}`);

      // Typically a service throws 404 if it explicitly queries where: { id: reqId, memberId: currentUserId }
      // Or 403 if it uses a guard. We accept either as "rejected".
      expect([403, 404]).toContain(res.status);
    });

    it("should reject Member B from downloading Member A's statement", async () => {
      const res = await request(app.getHttpServer())
        .get(`/statements/me/${statementA.id}/download`)
        .set('Authorization', `Bearer ${memberBToken}`);

      expect([403, 404]).toContain(res.status);
    });
  });

  describe('4. Logout and Token Invalidation', () => {
    let tempToken: string;
    let newAccessToken: string;

    it('should perform a full login to get a fresh token', async () => {
      // Step 1: Login
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifier: memberA.mobile, password: 'Password123' });

      if (loginRes.status !== 201) {
        console.error('Login Failed with 400:', loginRes.body);
      }
      expect(loginRes.status).toBe(201);

      tempToken = loginRes.body.tempToken;

      // Force the OTP to be 123456 for testing
      const hashedOtp = await bcrypt.hash('123456', 10);
      await prisma.authOtp.updateMany({
        where: { identifier: memberA.mobile, type: OtpType.LOGIN },
        data: { otpHash: hashedOtp },
      });

      // Step 2: Verify OTP
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ tempToken, otp: '123456' });

      if (verifyRes.status !== 201) {
        console.error('OTP Verify Failed with 400:', verifyRes.body);
      }
      expect(verifyRes.status).toBe(201);

      newAccessToken = verifyRes.body.accessToken;
      expect(newAccessToken).toBeDefined();
    });

    it('should allow access with the fresh token', async () => {
      await request(app.getHttpServer())
        .get('/members/me/dashboard')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);
    });

    it('should successfully logout', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(201); // Created since it's a POST
    });

    it('should reject access with the old token after logout (401)', async () => {
      await request(app.getHttpServer())
        .get('/members/me/dashboard')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });
  });
});
