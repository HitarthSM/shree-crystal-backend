import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionService } from '../src/common/services/index.js';

describe('MembersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let encryption: EncryptionService;
  let adminToken: string;
  let adminUser: any;
  let testMember: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);
    encryption = app.get<EncryptionService>(EncryptionService);

    // Setup Super Admin
    const passwordHash = await bcrypt.hash('AdminPass123', 10);
    adminUser = await prisma.adminUser.create({
      data: {
        email: `admin-${Date.now()}@test.com`,
        name: 'Test Super Admin',
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
      },
    });

    adminToken = jwtService.sign({
      sub: adminUser.id,
      userType: 'ADMIN',
      role: adminUser.role,
      version: adminUser.sessionVersion,
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.importBatch.deleteMany({ where: { adminId: adminUser.id } });
    if (testMember) {
      await prisma.member.delete({ where: { id: testMember.id } });
    }
    const newMembers = await prisma.member.findMany({ where: { mobile: { startsWith: '987' } } });
    for (const m of newMembers) {
      await prisma.member.delete({ where: { id: m.id } });
    }
    await prisma.adminUser.delete({ where: { id: adminUser.id } });

    await prisma.$disconnect();
    await app.close();
  });

  it('should create an initial member', async () => {
    const res = await request(app.getHttpServer())
      .post('/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Initial Test Member',
        dob: '1990-01-01',
        gender: 'MALE',
        addressLine1: 'Test Address',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        mobile: '9876543210',
        aadhaar: '123412341234',
      })
      .expect(201);

    testMember = res.body;
    expect(testMember.memberId).toBeDefined();
    expect(testMember.aadhaarHash).toBeDefined();
  });

  it('should reject Excel import with duplicate Aadhaar and commit valid rows', async () => {
    // 1. Generate Excel file in memory
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Members');

    worksheet.addRow([
      'MEMBER_NO',
      'MEMBER_NAME',
      'fatherOrHusbandName',
      'dob',
      'gender',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'pincode',
      'MOBILE',
      'email',
      'AADHAR',
    ]);
    // Valid Row
    worksheet.addRow([
      'M0001',
      'Valid Member',
      '',
      '1985-05-05',
      'FEMALE',
      'Address 1',
      '',
      'Pune',
      'MH',
      '411001',
      '9876543211',
      '',
      '987698769876',
    ]);
    // Invalid Row (Duplicate Aadhaar from testMember)
    worksheet.addRow([
      'M0002',
      'Invalid Member',
      '',
      '1995-05-05',
      'MALE',
      'Address 2',
      '',
      'Pune',
      'MH',
      '411001',
      '9876543212',
      '',
      '123412341234',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const filePath = path.join(__dirname, 'test-import.xlsx');
    fs.writeFileSync(filePath, buffer as Buffer);

    // 2. Upload file to /import
    const importRes = await request(app.getHttpServer())
      .post('/members/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', filePath, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    if (importRes.status !== 201) {
      console.error('Import failed:', importRes.body);
    }
    
    expect(importRes.status).toBe(201);

    const { batchId, validRowCount, invalidRowCount, errorList } = importRes.body;

    expect(batchId).toBeDefined();
    expect(validRowCount).toBe(1);
    expect(invalidRowCount).toBe(1);
    expect(errorList[0].reasons).toContain('Aadhaar already exists in DB');
    expect(errorList[0].row).toBe(3); // Row 3 is the invalid one

    // 3. Confirm import
    const confirmRes = await request(app.getHttpServer())
      .post(`/members/import/${batchId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.count).toBe(1);

    // 4. Verify in DB
    const members = await prisma.member.findMany({
      where: { mobile: { in: ['9876543210', '9876543211', '9876543212'] } },
    });

    expect(members.length).toBe(2);
    const validMember = members.find((m) => m.mobile === '9876543211');
    expect(validMember).toBeDefined();
    expect(validMember.fullName).toBe('Valid Member');

    // Cleanup file
    fs.unlinkSync(filePath);
  });
});
