import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EncryptionService, NotificationService } from '../../common/services/index.js';
import { CreateMemberDto } from '../dto/create-member.dto.js';
import { UpdateMemberDto } from '../dto/update-member.dto.js';
import { Prisma, MemberStatus, ActionType, ImportStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcrypt';
import { PendingActionService } from '../../pending-action/pending-action.service.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly notification: NotificationService,
    private readonly pendingActionService: PendingActionService,
    private readonly configService: ConfigService,
  ) {}

  private async generateMemberId(): Promise<string> {
    const lastMember = await this.prisma.member.findFirst({
      where: { memberId: { startsWith: 'SCC-' } },
      orderBy: { createdAt: 'desc' },
    });

    let nextNum = 1;
    if (lastMember && lastMember.memberId.startsWith('SCC-')) {
      const numPart = parseInt(lastMember.memberId.replace('SCC-', ''), 10);
      if (!isNaN(numPart)) {
        nextNum = numPart + 1;
      }
    }
    return `SCC-${nextNum.toString().padStart(5, '0')}`;
  }

  async create(dto: CreateMemberDto) {
    const aadhaarHash = this.encryption.hash(dto.aadhaar);
    const existing = await this.prisma.member.findFirst({
      where: {
        OR: [{ mobile: dto.mobile }, { aadhaarHash }, ...(dto.email ? [{ email: dto.email }] : [])],
      },
    });

    if (existing) {
      if (existing.mobile === dto.mobile)
        throw new BadRequestException('Mobile number already registered');
      if (existing.aadhaarHash === aadhaarHash)
        throw new BadRequestException('Aadhaar number already registered');
      if (dto.email && existing.email === dto.email)
        throw new BadRequestException('Email already registered');
    }

    const memberId = await this.generateMemberId();
    const aadhaarEncrypted = this.encryption.encrypt(dto.aadhaar);
    const panEncrypted = dto.pan ? this.encryption.encrypt(dto.pan) : null;
    const defaultPass = this.configService.getOrThrow<string>('DEFAULT_MEMBER_PASSWORD');
    const defaultPasswordHash = await bcrypt.hash(defaultPass, 10);

    const member = await this.prisma.member.create({
      data: {
        memberId,
        passwordHash: defaultPasswordHash,
        fullName: dto.fullName,
        fatherOrHusbandName: dto.fatherOrHusbandName,
        dob: new Date(dto.dob),
        gender: dto.gender,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        mobile: dto.mobile,
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

    await this.notification.sendWelcomeSms(member.mobile, member.memberId);
    if (member.email) {
      await this.notification.sendWelcomeEmail(member.email, member.memberId);
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
    const existingMobiles = new Set(
      (await this.prisma.member.findMany({ select: { mobile: true } }))
        .filter((m) => m.mobile)
        .map((m) => m.mobile),
    );

    const fileAadhaars = new Set();
    const fileMobiles = new Set();

    // Find the header row and map columns
    let dataStartRow = 0;
    let headerMap: Record<string, number> = {};
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i] && rawData[i].length > 0) {
        const hasMemberNo = rawData[i].some((col: any) => String(col).trim().toUpperCase() === 'MEMBER_NO');
        if (hasMemberNo) {
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
      const idx = headerMap[header.toUpperCase()] !== undefined ? headerMap[header.toUpperCase()] : fallbackIdx;
      return String(row[idx] || '').trim();
    };

    // Process data rows
    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0 || !row[0]) continue; // Skip empty rows

      processed++;

      const memberNo = getCol(row, 'MEMBER_NO', 0);
      const fullName = getCol(row, 'MEMBER_NAME', 1);
      let mobile = getCol(row, 'MOBILE', 9);
      let aadhaar = getCol(row, 'AADHAR', 15);

      const rowErrors = [];

      // Generate dummies if missing to support legacy data
      if (!mobile) mobile = `00000${memberNo.padStart(5, '0')}`; // Unique dummy mobile
      if (!aadhaar) aadhaar = `000000${memberNo.padStart(6, '0')}`; // Unique dummy aadhaar

      const aadhaarHash = this.encryption.hash(aadhaar);

      if (existingAadhaars.has(aadhaarHash)) rowErrors.push('Aadhaar already exists in DB');
      if (fileAadhaars.has(aadhaar)) rowErrors.push('Duplicate Aadhaar in file');
      if (existingMobiles.has(mobile)) rowErrors.push('Mobile already exists in DB');
      if (fileMobiles.has(mobile)) rowErrors.push('Duplicate Mobile in file');

      fileAadhaars.add(aadhaar);
      fileMobiles.add(mobile);

      if (rowErrors.length > 0) {
        errorList.push({ row: i + 1, reasons: rowErrors });
      } else {
        const address = [getCol(row, 'ADD1', 19), getCol(row, 'ADD2', 20), getCol(row, 'ADD3', 21), getCol(row, 'ADD4', 22)]
          .filter(Boolean)
          .join(', ');

        validRows.push({
          memberNo,
          fullName,
          dob: getCol(row, 'BIRTH_DATE', 6),
          gender: getCol(row, 'SEX', 8) === 'M' ? 'MALE' : 'FEMALE',
          addressLine1: address || getCol(row, 'ADDRESS', 2),
          city: getCol(row, 'DISTNAME', 24) || 'Unknown',
          state: 'Unknown',
          pincode: '000000', // Excel doesn't have pincode clearly mapped
          mobile,
          aadhaar,
        });
      }
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        filename: file.originalname,
        adminId,
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
      // Use the memberNo directly from the Excel file to ensure it matches statements!
      const memberId = row.memberNo
        ? String(row.memberNo)
        : `SCC-${Math.floor(Math.random() * 10000)}`;

      return {
        memberId,
        passwordHash: defaultPasswordHash,
        fullName: row.fullName || 'Unknown',
        dob: new Date(row.dob || '1970-01-01'),
        gender: row.gender === 'MALE' || row.gender === 'FEMALE' ? row.gender : 'OTHER',
        addressLine1: row.addressLine1 || 'Unknown',
        city: row.city || 'Unknown',
        state: row.state || 'Unknown',
        pincode: row.pincode || '000000',
        mobile: row.mobile,
        aadhaarHash: this.encryption.hash(row.aadhaar),
        aadhaarEncrypted: this.encryption.encrypt(row.aadhaar),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      if (membersToCreate.length > 0) {
        await tx.member.createMany({ data: membersToCreate });
      }
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: ImportStatus.COMMITTED, committedAt: new Date() },
      });
    });

    return { success: true, count: membersToCreate.length };
  }

  async findAll(page: number = 1, limit: number = 10, search?: string, status?: MemberStatus) {
    const where: Prisma.MemberWhereInput = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { mobile: { contains: search } },
          { memberId: { contains: search, mode: 'insensitive' } },
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
      items: items.map((i) => ({
        ...i,
        aadhaarEncrypted: 'MASKED',
        panEncrypted: i.panEncrypted ? 'MASKED' : null,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Member not found');

    // Mask by default
    member.aadhaarEncrypted =
      'XXXX-XXXX-' + this.encryption.decrypt(member.aadhaarEncrypted).slice(-4);
    if (member.panEncrypted) {
      member.panEncrypted = 'XXXXXXX' + this.encryption.decrypt(member.panEncrypted).slice(-3);
    }
    return member;
  }

  async update(id: string, dto: UpdateMemberDto, adminId: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Member not found');

    const { reason, ...changes } = dto;
    if (changes.aadhaar) {
      (changes as any).aadhaarHash = this.encryption.hash(changes.aadhaar);
      (changes as any).aadhaarEncrypted = this.encryption.encrypt(changes.aadhaar);
      delete changes.aadhaar;
    }
    if (changes.pan) {
      (changes as any).panEncrypted = this.encryption.encrypt(changes.pan);
      delete changes.pan;
    }

    return this.pendingActionService.propose(
      ActionType.MEMBER_EDIT,
      { memberId: id, changes, reason },
      adminId,
    );
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
        select: { fullName: true, memberId: true, membershipDate: true },
      }),
      // Latest active loan
      this.prisma.memberLoan.findFirst({
        where: { memberId, status: 'ACTIVE' },
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
      this.prisma.supportQuery.count({
        where: { memberId, status: 'OPEN' },
      }),
    ]);

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return {
      profile: member,
      latestLoan,
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
