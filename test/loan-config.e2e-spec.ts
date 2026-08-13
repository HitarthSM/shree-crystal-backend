import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, InterestType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RateSchedulerService } from '../src/loan-config/rate-scheduler.service';
import { PendingActionService } from '../src/pending-action/pending-action.service';

describe('LoanConfigController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let rateScheduler: RateSchedulerService;
  let pendingActionService: PendingActionService;
  let adminToken1: string;
  let adminToken2: string;
  let admin1: any;
  let admin2: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    rateScheduler = moduleFixture.get<RateSchedulerService>(RateSchedulerService);
    pendingActionService = moduleFixture.get<PendingActionService>(PendingActionService);

    // Create two admins for maker-checker
    const pwd = await bcrypt.hash('Password123!', 10);
    admin1 = await prisma.adminUser.create({
      data: {
        email: 'maker@example.com',
        name: 'Maker',
        passwordHash: pwd,
        role: AdminRole.SUPER_ADMIN,
      },
    });
    admin2 = await prisma.adminUser.create({
      data: {
        email: 'checker@example.com',
        name: 'Checker',
        passwordHash: pwd,
        role: AdminRole.SUPER_ADMIN,
      },
    });

    adminToken1 = jwtService.sign({
      sub: admin1.id,
      role: admin1.role,
      userType: 'ADMIN',
      version: admin1.sessionVersion,
    });
    adminToken2 = jwtService.sign({
      sub: admin2.id,
      role: admin2.role,
      userType: 'ADMIN',
      version: admin2.sessionVersion,
    });

    // Enable maker-checker for RATE_CHANGE
    await prisma.settings.create({
      data: {
        key: 'maker_checker.required.RATE_CHANGE',
        value: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.memberLoan.deleteMany();
    await prisma.rateHistory.deleteMany();
    await prisma.loanType.deleteMany();
    await prisma.pendingAction.deleteMany();
    await prisma.settings.deleteMany({ where: { key: 'maker_checker.required.RATE_CHANGE' } });
    await prisma.adminUser.deleteMany({ where: { id: { in: [admin1.id, admin2.id] } } });
    await app.close();
  });

  it('rate change with future effectiveFrom does not affect calculator until date, and MemberLoan is immutable', async () => {
    // 1. Create a LoanType
    const createRes = await request(app.getHttpServer())
      .post('/loan-config/loan-types')
      .set('Authorization', `Bearer ${adminToken1}`)
      .send({
        name: 'Home Loan',
        interestRate: 8.5,
        interestType: InterestType.REDUCING,
        maxTenure: 240,
        processingFee: 5000,
        minAmount: 100000,
        maxAmount: 5000000,
        active: true,
      })
      .expect(201);
    const loanType = createRes.body;

    // We must manually add an initial RateHistory so we can create a MemberLoan
    const initialRateHistory = await prisma.rateHistory.create({
      data: {
        schemeId: loanType.id,
        schemeType: 'LOAN_TYPE',
        newRate: 8.5,
        effectiveFrom: new Date(),
        changedById: admin1.id,
        approvedById: admin1.id,
      },
    });

    // 2. Create a historical MemberLoan
    // We need a dummy member first
    const member = await prisma.member.create({
      data: {
        memberId: `TEST-${Date.now()}`,
        fullName: 'Test Member',
        dob: new Date('1990-01-01'),
        gender: 'MALE',
        addressLine1: 'Addr',
        city: 'City',
        state: 'State',
        pincode: '123456',
        mobile: `${Date.now()}`.substring(0, 10),
        aadhaarHash: `hash-${Date.now()}`,
        aadhaarEncrypted: 'enc',
        shareCapital: 100,
      },
    });

    const historicalLoan = await prisma.memberLoan.create({
      data: {
        memberId: member.id,
        loanTypeId: loanType.id,
        rateHistoryId: initialRateHistory.id,
        principalAmount: 1000000,
        outstandingAmount: 1000000,
        status: 'ACTIVE',
      },
      include: { rateHistory: true },
    });
    expect(Number(historicalLoan.rateHistory.newRate)).toBe(8.5);

    // 3. Propose a Rate Change with future date
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 2);

    const patchRes = await request(app.getHttpServer())
      .patch(`/loan-config/loan-types/${loanType.id}`)
      .set('Authorization', `Bearer ${adminToken1}`)
      .send({
        interestRate: 9.0, // New rate
        effectiveFrom: futureDate.toISOString(),
      })
      .expect(200);

    // 4. Approve the Rate Change
    const pendingActions = await pendingActionService.findAll('RATE_CHANGE');
    const ourAction = pendingActions.find((a) => a.payload.schemeId === loanType.id);
    expect(ourAction).toBeDefined();

    await pendingActionService.approve(ourAction.id, admin2.id);

    // 5. Calculator should still use 8.5 because futureDate hasn't arrived (scheduled job hasn't applied it)
    const calcRes1 = await request(app.getHttpServer())
      .get(`/loan-config/calculate?amount=100000&tenure=12&loanTypeId=${loanType.id}`)
      .expect(200);
    // Rough check on EMI for 8.5%
    const rate1 = 8.5 / 100 / 12;
    const expectedEmi1 = (100000 * rate1 * Math.pow(1 + rate1, 12)) / (Math.pow(1 + rate1, 12) - 1);
    expect(calcRes1.body.emi).toBeCloseTo(expectedEmi1, 2);

    // 6. Simulate time passing and run the scheduled job
    // Actually, we can just cheat and update the RateHistory in DB to make effectiveFrom in the past
    // so that when we run RateSchedulerService, it picks it up.
    await prisma.rateHistory.updateMany({
      where: { schemeId: loanType.id },
      data: { effectiveFrom: new Date(Date.now() - 10000) }, // 10 seconds ago
    });

    await rateScheduler.applyFutureRates();

    // 7. Calculator should now use 9.0
    const calcRes2 = await request(app.getHttpServer())
      .get(`/loan-config/calculate?amount=100000&tenure=12&loanTypeId=${loanType.id}`)
      .expect(200);
    const rate2 = 9.0 / 100 / 12;
    const expectedEmi2 = (100000 * rate2 * Math.pow(1 + rate2, 12)) / (Math.pow(1 + rate2, 12) - 1);
    expect(calcRes2.body.emi).toBeCloseTo(expectedEmi2, 2);

    // 8. The historical MemberLoan should still point to 8.5
    const checkedHistoricalLoan = await prisma.memberLoan.findUnique({
      where: { id: historicalLoan.id },
      include: { rateHistory: true },
    });
    expect(Number(checkedHistoricalLoan.rateHistory.newRate)).toBe(8.5);

    // Cleanup member
    await prisma.memberLoan.delete({ where: { id: historicalLoan.id } });
    await prisma.member.delete({ where: { id: member.id } });
  });
});
