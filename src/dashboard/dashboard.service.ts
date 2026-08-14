import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminDashboard() {
    // 1. Total Active Members
    const totalActiveMembers = await this.prisma.member.count({
      where: { status: 'ACTIVE' },
    });

    // 2. Pending Approvals
    // Since PendingAction might not be populated heavily, we'll count it and fetch top 5.
    const pendingCount = await this.prisma.pendingAction.count({
      where: { status: 'PENDING' },
    });
    const pendingApprovals = await this.prisma.pendingAction.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 3. Recent Activity Log
    const recentActivity = await this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 4. Mock Financials (per the implementation plan)
    const mockLoans = 42500000;
    const mockDeposits = 85000000;

    return {
      stats: {
        totalActiveMembers,
        pendingApprovalsCount: pendingCount,
        totalLoanDisbursed: mockLoans,
        activeDeposits: mockDeposits,
      },
      pendingApprovals,
      recentActivity,
    };
  }
}
