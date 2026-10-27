import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EncryptionService, NotificationsService } from '../../common/services/index.js';
import { CreateMemberDto } from '../dto/create-member.dto.js';
import { UpdateMemberDto } from '../dto/update-member.dto.js';
import { Prisma, MemberStatus, ActionType, ImportStatus, Gender } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcrypt';
import { PendingActionsService } from '../../pending-actions/pending-actions.service.js';

/** Fields a MEMBER_EDIT proposal may carry. Aadhaar/PAN arrive already hashed/encrypted. */
type MemberEditChanges = Partial<{
  fullName: string;
  fatherOrHusbandName: string;
  dateOfBirth: string;
  gender: Gender;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  mobileNumber: string;
  email: string;
  nomineeName: string;
  nomineeRelation: string;
  nomineeContact: string;
  shareCapital: string;
  aadhaarHash: string;
  aadhaarEncrypted: string;
  panEncrypted: string;
}>;

type MemberEditPayload = { memberId: string; changes: MemberEditChanges; reason: string };
type MemberStatusPayload = { memberId: string; newStatus: MemberStatus; reason: string };

/** Credentials, lockout counters and the Aadhaar hash never leave the server. */
function stripInternalFields<T extends object>(
  member: T,
): Omit<T, 'passwordHash' | 'aadhaarHash' | 'failedAttempts' | 'lockedUntil' | 'sessionVersion'> {
  const {
    passwordHash: _passwordHash,
    aadhaarHash: _aadhaarHash,
    failedAttempts: _failedAttempts,
    lockedUntil: _lockedUntil,
    sessionVersion: _sessionVersion,
    ...rest
  } = member as T & {
    passwordHash?: unknown;
    aadhaarHash?: unknown;
    failedAttempts?: unknown;
    lockedUntil?: unknown;
    sessionVersion?: unknown;
  };
  return rest;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly notification: NotificationsService,
    private readonly pendingActionService: PendingActionsService,
    private readonly configService: ConfigService,
  ) {
    this.pendingActionService.registerHandler(ActionType.MEMBER_EDIT, (payload) =>
      this.applyMemberEdit(payload as MemberEditPayload),
    );
    this.pendingActionService.registerHandler(ActionType.MEMBER_STATUS_CHANGE, (payload) =>
      this.applyStatusChange(payload as MemberStatusPayload),
    );
  }

  private async generateMembershipNumber(): Promise<string> {
    const lastMember = await this.prisma.member.findFirst({
      where: { membershipNumber: { startsWith: 'SCC-' } },
      orderBy: { createdAt: 'desc' },
    });

    let nextNum = 1;
    if (lastMember && lastMember.membershipNumber.startsWith('SCC-')) {
      const numPart = parseInt(lastMember.membershipNumber.replace('SCC-', ''), 10);
      if (!isNaN(numPart)) {
        nextNum = numPart + 1;
      }
    }
    return `SCC-${nextNum.toString().padStart(5, '0')}`;
  }

  private parseDateOfBirth(rawDob: unknown, rawAge?: unknown): Date {
    const fallback = new Date('1970-01-01T00:00:00.000Z');

    if (rawDob !== undefined && rawDob !== null && rawDob !== '') {
      if (rawDob instanceof Date && !isNaN(rawDob.getTime())) {
        return rawDob;
      }

      const str = String(rawDob).trim();
      const num = Number(str);
      // Excel serial date code (e.g. 26663)
      if (!isNaN(num) && num > 1000 && num < 100000) {
        const date = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (
          !isNaN(date.getTime()) &&
          date.getFullYear() >= 1900 &&
          date.getFullYear() <= new Date().getFullYear()
        ) {
          return date;
        }
      }

      // DD/MM/YYYY or DD-MM-YYYY
      const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmyMatch) {
        const d = parseInt(dmyMatch[1], 10);
        const m = parseInt(dmyMatch[2], 10) - 1;
        const y = parseInt(dmyMatch[3], 10);
        const date = new Date(Date.UTC(y, m, d));
        if (
          !isNaN(date.getTime()) &&
          date.getFullYear() >= 1900 &&
          date.getFullYear() <= new Date().getFullYear()
        ) {
          return date;
        }
      }

      const parsed = new Date(str);
      if (
        !isNaN(parsed.getTime()) &&
        parsed.getFullYear() >= 1900 &&
        parsed.getFullYear() <= new Date().getFullYear()
      ) {
        return parsed;
      }
    }

    if (rawAge !== undefined && rawAge !== null && rawAge !== '') {
      const ageNum = parseInt(String(rawAge).trim(), 10);
      if (!isNaN(ageNum) && ageNum > 0 && ageNum < 120) {
        const currentYear = new Date().getFullYear();
        return new Date(Date.UTC(currentYear - ageNum, 0, 1));
      }
    }

    return fallback;
  }

  async create(dto: CreateMemberDto) {
    const aadhaarHash = this.encryption.hash(dto.aadhaar);
    // Rows created before the keyed hash was introduced still carry the old SHA-256.
    const knownHashes = this.encryption.hashCandidates(dto.aadhaar);
    const existing = await this.prisma.member.findFirst({
      where: {
        OR: [
          { mobileNumber: dto.mobileNumber },
          { aadhaarHash: { in: knownHashes } },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.mobileNumber === dto.mobileNumber)
        throw new BadRequestException('Mobile number already registered');
      if (knownHashes.includes(existing.aadhaarHash))
        throw new BadRequestException('Aadhaar number already registered');
      if (dto.email && existing.email === dto.email)
        throw new BadRequestException('Email already registered');
    }

    const membershipNumber = await this.generateMembershipNumber();
    const aadhaarEncrypted = this.encryption.encrypt(dto.aadhaar);
    const panEncrypted = dto.pan ? this.encryption.encrypt(dto.pan) : null;
    const defaultPass = this.configService.getOrThrow<string>('DEFAULT_MEMBER_PASSWORD');
    const defaultPasswordHash = await bcrypt.hash(defaultPass, 10);

    const member = await this.prisma.member.create({
      data: {
        membershipNumber,
        passwordHash: defaultPasswordHash,
        fullName: dto.fullName,
        fatherOrHusbandName: dto.fatherOrHusbandName,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        mobileNumber: dto.mobileNumber,
        email: dto.email,
        aadhaarHash,
        aadhaarEncrypted,
        panEncrypted,
        nomineeName: dto.nomineeName,
        nomineeRelation: dto.nomineeRelation,
        nomineeContact: dto.nomineeContact,
        shareCapital: dto.shareCapital
          ? new Prisma.Decimal(dto.shareCapital)
          : new Prisma.Decimal(0),
      },
    });

    await this.notification.sendWelcomeSms(member.mobileNumber, member.membershipNumber);
    if (member.email) {
      await this.notification.sendWelcomeEmail(member.email, member.membershipNumber);
    }

    return member;
  }

  async importExcel(file: Express.Multer.File, adminId: string) {
    let workbook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch (e) {
      throw new BadRequestException('Invalid Excel or CSV file format.');
    }
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Parse to JSON array of arrays (header: 1)
    const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const validRows: any[] = [];
    const errorList: any[] = [];
    let processed = 0;

    const existingAadhaars = new Set(
      (await this.prisma.member.findMany({ select: { aadhaarHash: true } }))
        .filter((m) => m.aadhaarHash)
        .map((m) => m.aadhaarHash),
    );
    const existingMembershipNumbers = new Set(
      (await this.prisma.member.findMany({ select: { membershipNumber: true } })).map(
        (m) => m.membershipNumber,
      ),
    );
    const fileMembershipNumbers = new Set<string>();
    const existingMobiles = new Set(
      (await this.prisma.member.findMany({ select: { mobileNumber: true } }))
        .filter((m) => m.mobileNumber)
        .map((m) => m.mobileNumber),
    );

    const fileAadhaars = new Set();
    const fileMobiles = new Set();

    // Find the header row and map columns
    let dataStartRow = 0;
    const headerMap: Record<string, number> = {};
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i] && rawData[i].length > 0) {
        const hasMembershipNumberColumn = rawData[i].some(
          (col: any) => String(col).trim().toUpperCase() === 'MEMBER_NO',
        );
        if (hasMembershipNumberColumn) {
          dataStartRow = i + 1; // Data starts below the header
          rawData[i].forEach((col: any, index: number) => {
            if (col) headerMap[String(col).trim().toUpperCase()] = index;
          });
          break;
        }
      }
    }

    if (dataStartRow === 0) {
      throw new BadRequestException('Could not find header row starting with MEMBER_NO');
    }

    // Helper to get mapped column or fallback
    const getCol = (row: any[], header: string, fallbackIdx: number) => {
      const idx =
        headerMap[header.toUpperCase()] !== undefined
          ? headerMap[header.toUpperCase()]
          : fallbackIdx;
      return String(row[idx] || '').trim();
    };

    // Process data rows
    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows

      processed++;

      const membershipNumber = getCol(row, 'MEMBER_NO', 0);
      const fullName = getCol(row, 'MEMBER_NAME', 1);
      let mobileNumber = getCol(row, 'MOBILE', 9);
      let aadhaar = getCol(row, 'AADHAR', 15);

      const rowErrors = [];

      // Generate dummies if missing to support legacy data
      if (!mobileNumber) mobileNumber = `00000${membershipNumber.padStart(5, '0')}`; // Unique dummy mobileNumber
      if (!aadhaar) aadhaar = `000000${membershipNumber.padStart(6, '0')}`; // Unique dummy aadhaar

      const aadhaarHash = this.encryption.hash(aadhaar);

      if (existingMembershipNumbers.has(membershipNumber))
        rowErrors.push('Member number already exists in DB');
      if (fileMembershipNumbers.has(membershipNumber))
        rowErrors.push('Duplicate member number in file');
      fileMembershipNumbers.add(membershipNumber);

      if (this.encryption.hashCandidates(aadhaar).some((h) => existingAadhaars.has(h)))
        rowErrors.push('Aadhaar already exists in DB');
      if (fileAadhaars.has(aadhaar)) rowErrors.push('Duplicate Aadhaar in file');
      if (existingMobiles.has(mobileNumber)) rowErrors.push('Mobile already exists in DB');
      if (fileMobiles.has(mobileNumber)) rowErrors.push('Duplicate Mobile in file');

      fileAadhaars.add(aadhaar);
      fileMobiles.add(mobileNumber);

      if (rowErrors.length > 0) {
        errorList.push({
          row: i + 1,
          membershipNumber: membershipNumber || `Row ${i + 1}`,
          fullName: fullName || '-',
          mobileNumber: mobileNumber
            ? `${mobileNumber.slice(0, 3)}****${mobileNumber.slice(-4)}`
            : '-',
          reasons: rowErrors,
        });
      } else {
        const address = [
          getCol(row, 'ADD1', 19),
          getCol(row, 'ADD2', 20),
          getCol(row, 'ADD3', 21),
          getCol(row, 'ADD4', 22),
        ]
          .filter(Boolean)
          .join(', ');

        const age = getCol(row, 'AGE', 7);
        const dateOfBirth = this.parseDateOfBirth(getCol(row, 'BIRTH_DATE', 6), age);
        validRows.push({
          membershipNumber,
          fullName,
          dateOfBirth: dateOfBirth.toISOString(),
          age,
          gender: getCol(row, 'SEX', 8) === 'M' ? 'MALE' : 'FEMALE',
          addressLine1: address || getCol(row, 'ADDRESS', 2),
          city: getCol(row, 'DISTNAME', 24) || 'Unknown',
          state: 'Unknown',
          pincode: '000000', // Excel doesn't have pincode clearly mapped
          mobileNumber,
          // Never keep a plain Aadhaar number in the stored preview.
          aadhaarEncrypted: this.encryption.encrypt(aadhaar),
        });
      }
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        fileName: file.originalname,
        createdById: adminId,
        totalRows: processed,
        validRows: validRows.length,
        invalidRows: errorList.length,
        previewData: validRows,
        errorList: errorList,
      },
    });

    return {
      batchId: batch.id,
      totalRows: processed,
      validRowCount: validRows.length,
      invalidRowCount: errorList.length,
      errorList,
      previewData: validRows.slice(0, 50),
    };
  }

  async getImportBatch(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      validRowCount: batch.validRows,
      invalidRowCount: batch.invalidRows,
      errorList: batch.errorList,
      previewData: Array.isArray(batch.previewData)
        ? (batch.previewData as any[]).slice(0, 50)
        : [],
      createdAt: batch.createdAt,
    };
  }

  async confirmImport(batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== ImportStatus.PENDING)
      throw new BadRequestException('Batch is not pending');

    const validRows = batch.previewData as any[];

    const defaultPass = this.configService.getOrThrow<string>('DEFAULT_MEMBER_PASSWORD');
    const defaultPasswordHash = await bcrypt.hash(defaultPass, 10);

    const membersToCreate = validRows.map((row) => {
      // The member number comes from the file so it matches the statement file names.
      if (!row.membershipNumber) {
        throw new BadRequestException('Import row is missing a member number');
      }
      const membershipNumber = String(row.membershipNumber);
      // Batches stored before the preview was encrypted still carry a plain `aadhaar`.
      const aadhaar: string = row.aadhaar ?? this.encryption.decrypt(row.aadhaarEncrypted);

      return {
        membershipNumber,
        passwordHash: defaultPasswordHash,
        fullName: row.fullName || 'Unknown',
        dateOfBirth: this.parseDateOfBirth(row.dateOfBirth, row.age),
        gender: row.gender === 'MALE' || row.gender === 'FEMALE' ? row.gender : 'OTHER',
        addressLine1: row.addressLine1 || 'Unknown',
        city: row.city || 'Unknown',
        state: row.state || 'Unknown',
        pincode: row.pincode || '000000',
        mobileNumber: row.mobileNumber,
        aadhaarHash: this.encryption.hash(aadhaar),
        aadhaarEncrypted: this.encryption.encrypt(aadhaar),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      // Claim the batch first so two concurrent confirms cannot both import it.
      const claim = await tx.importBatch.updateMany({
        where: { id: batchId, status: ImportStatus.PENDING },
        data: { status: ImportStatus.COMMITTED, committedAt: new Date() },
      });
      if (claim.count === 0) throw new BadRequestException('Batch is not pending');

      if (membersToCreate.length > 0) {
        await tx.member.createMany({ data: membersToCreate });
      }
    });

    return { success: true, count: membersToCreate.length };
  }

  async findAll(page: number = 1, limit: number = 10, search?: string, status?: MemberStatus) {
    const where: Prisma.MemberWhereInput = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { mobileNumber: { contains: search } },
          { membershipNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.member.count({ where }),
    ]);

    // Mask sensitive info
    return {
      items: items.map((item) => ({
        ...stripInternalFields(item),
        aadhaarEncrypted: 'MASKED',
        panEncrypted: item.panEncrypted ? 'MASKED' : null,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        loans: {
          include: {
            loanType: true,
            repayments: {
              where: { status: 'COMPLETED' },
              orderBy: { paidAt: 'desc' },
            },
          },
        },
      },
    });
    if (!member) throw new NotFoundException('Member not found');

    // Mask by default and strip sensitive authentication credentials
    const safeMember = stripInternalFields(member);
    safeMember.aadhaarEncrypted =
      'XXXX-XXXX-' + this.encryption.decrypt(member.aadhaarEncrypted).slice(-4);
    if (safeMember.panEncrypted) {
      safeMember.panEncrypted =
        'XXXXXXX' + this.encryption.decrypt(safeMember.panEncrypted).slice(-3);
    }
    return safeMember;
  }

  async update(id: string, dto: UpdateMemberDto, adminId: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Member not found');

    const { reason, aadhaar, pan, ...plain } = dto;
    const changes: MemberEditChanges = { ...plain };
    if (aadhaar) {
      changes.aadhaarHash = this.encryption.hash(aadhaar);
      changes.aadhaarEncrypted = this.encryption.encrypt(aadhaar);
    }
    if (pan) {
      changes.panEncrypted = this.encryption.encrypt(pan);
    }

    return this.pendingActionService.propose(
      ActionType.MEMBER_EDIT,
      { memberId: id, changes, reason },
      adminId,
    );
  }

  /** Applies an approved MEMBER_EDIT. Only whitelisted fields are written. */
  private async applyMemberEdit(payload: MemberEditPayload): Promise<void> {
    const { memberId, changes } = payload;
    const data: Prisma.MemberUpdateInput = {
      fullName: changes.fullName,
      fatherOrHusbandName: changes.fatherOrHusbandName,
      gender: changes.gender,
      addressLine1: changes.addressLine1,
      addressLine2: changes.addressLine2,
      city: changes.city,
      state: changes.state,
      pincode: changes.pincode,
      mobileNumber: changes.mobileNumber,
      email: changes.email,
      nomineeName: changes.nomineeName,
      nomineeRelation: changes.nomineeRelation,
      nomineeContact: changes.nomineeContact,
      aadhaarHash: changes.aadhaarHash,
      aadhaarEncrypted: changes.aadhaarEncrypted,
      panEncrypted: changes.panEncrypted,
      dateOfBirth: changes.dateOfBirth ? new Date(changes.dateOfBirth) : undefined,
      shareCapital: changes.shareCapital ? new Prisma.Decimal(changes.shareCapital) : undefined,
    };
    try {
      await this.prisma.member.update({ where: { id: memberId }, data, select: { id: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') throw new NotFoundException('Member not found');
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Mobile, email or Aadhaar already belongs to another member',
          );
        }
      }
      throw error;
    }
  }

  /** Applies an approved MEMBER_STATUS_CHANGE; a non-ACTIVE member is signed out everywhere. */
  private async applyStatusChange(payload: MemberStatusPayload): Promise<void> {
    const { memberId, newStatus } = payload;
    if (!Object.values(MemberStatus).includes(newStatus)) {
      throw new BadRequestException('Invalid member status');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { status: newStatus },
        select: { id: true },
      });
      if (newStatus !== MemberStatus.ACTIVE) {
        await tx.authSession.updateMany({
          where: { memberId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
  }

  async changeStatus(id: string, status: MemberStatus, reason: string, adminId: string) {
    return this.pendingActionService.propose(
      ActionType.MEMBER_STATUS_CHANGE,
      { memberId: id, newStatus: status, reason },
      adminId,
    );
  }

  async getDashboardSummary(memberId: string) {
    const [member, latestLoan, latestStatement, recentNotices, openQueryCount] = await Promise.all([
      // Basic profile summary
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: { fullName: true, membershipNumber: true, membershipDate: true },
      }),
      // Latest active loan
      this.prisma.memberLoan.findFirst({
        where: { memberId, status: 'ACTIVE' },
        select: {
          id: true,
          principalAmount: true,
          outstandingAmount: true,
          createdAt: true,
          loanType: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Latest published statement
      this.prisma.statement.findFirst({
        where: { memberId, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
      }),
      // Most recent 5 notices relevant to this member
      this.prisma.noticeDelivery.findMany({
        where: { memberId, notice: { isActive: true } },
        include: { notice: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // Count of open support queries
      this.prisma.supportTicket.count({
        where: { memberId, status: 'OPEN' },
      }),
    ]);

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // No EMI or due date: the society keeps no repayment schedule here, so nothing is invented.
    const latestLoanData = latestLoan
      ? {
          id: latestLoan.id,
          type: latestLoan.loanType?.name || 'Standard Member Loan',
          principalAmount: latestLoan.principalAmount,
          outstandingAmount: latestLoan.outstandingAmount,
          createdAt: latestLoan.createdAt,
        }
      : null;

    return {
      profile: member,
      latestLoan: latestLoanData,
      latestStatement,
      recentNotices: recentNotices.map((delivery) => ({
        ...delivery.notice,
        deliveryStatus: delivery.status,
        sentAt: delivery.sentAt,
      })),
      openQueryCount,
    };
  }
}
