import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('MemberStatementsController (e2e)', () => {
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

  describe('Statement Ownership & Access', () => {
    let member1: any;
    let member2: any;
    let statement1: any;
    let statement2: any;
    let token1: string;
    let token2: string;

    beforeAll(async () => {
      // Clean up previous if any
      await prisma.statement.deleteMany({
        where: {
          memberId: { in: ['MEMBER1_ID_E2E', 'MEMBER2_ID_E2E'] },
        },
      });
      await prisma.member.deleteMany({
        where: {
          memberId: { in: ['M1-E2E', 'M2-E2E'] },
        },
      });

      // Helper to generate a dummy member
      const createDummyMember = async (mid: string, mobile: string) => {
        return prisma.member.create({
          data: {
            id: `${mid}_ID_E2E`,
            memberId: mid,
            fullName: 'Test Member ' + mid,
            dob: new Date('1990-01-01'),
            gender: 'MALE',
            addressLine1: 'Test Address',
            city: 'Test City',
            state: 'Test State',
            pincode: '123456',
            mobile,
            aadhaarHash: 'hash_' + mid,
            aadhaarEncrypted: 'enc_' + mid,
            shareCapital: 100,
            status: 'ACTIVE',
          },
        });
      };

      // Helper to generate dummy admin
      const admin =
        (await prisma.adminUser.findFirst()) ||
        (await prisma.adminUser.create({
          data: {
            email: 'test_admin_e2e@example.com',
            name: 'Test Admin',
            passwordHash: 'hash',
            role: 'SUPER_ADMIN',
          },
        }));

      member1 = await createDummyMember('M1-E2E', '9999999991');
      member2 = await createDummyMember('M2-E2E', '9999999992');

      // Create PUBLISHED statements for them
      statement1 = await prisma.statement.create({
        data: {
          memberId: member1.id,
          period: '2024-Q1',
          category: 'GENERAL',
          fileUrl: 'https://test-bucket/m1-statement.pdf',
          status: 'PUBLISHED',
          uploadedById: admin.id,
        },
      });

      statement2 = await prisma.statement.create({
        data: {
          memberId: member2.id,
          period: '2024-Q1',
          category: 'GENERAL',
          fileUrl: 'https://test-bucket/m2-statement.pdf',
          status: 'PUBLISHED',
          uploadedById: admin.id,
        },
      });

      // Generate JWT tokens for members
      token1 = jwtService.sign({
        sub: member1.id,
        userType: 'MEMBER',
        version: member1.sessionVersion,
      });
      token2 = jwtService.sign({
        sub: member2.id,
        userType: 'MEMBER',
        version: member2.sessionVersion,
      });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.statement.deleteMany({
        where: { id: { in: [statement1.id, statement2.id] } },
      });
      await prisma.member.deleteMany({
        where: { id: { in: [member1.id, member2.id] } },
      });
    });

    it('Member 1 should be able to download their own statement', async () => {
      await request(app.getHttpServer())
        .get(`/statements/me/${statement1.id}/download`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(302); // Expecting a redirect because controller uses res.redirect(fileUrl)
    });

    it("Member 1 should NOT be able to download Member 2's statement", async () => {
      const res = await request(app.getHttpServer())
        .get(`/statements/me/${statement2.id}/download`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(403);

      expect(res.body.message).toMatch(/do not have access/i);
    });

    it("Member 2 should NOT be able to download Member 1's statement", async () => {
      const res = await request(app.getHttpServer())
        .get(`/statements/me/${statement1.id}/download`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);

      expect(res.body.message).toMatch(/do not have access/i);
    });

    it("Should list only Member 1's statements on /statements/me", async () => {
      const res = await request(app.getHttpServer())
        .get('/statements/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(statement1.id);
    });
  });
});
