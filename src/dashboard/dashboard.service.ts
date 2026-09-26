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

    // 4. Real loan financials — aggregate disbursed loans only
    // (PENDING_APPROVAL/REJECTED loans never had money move).
    const disbursedLoanStatuses = ['ACTIVE', 'CLOSED', 'DEFAULTED'] as const;
    const loanAgg = await this.prisma.memberLoan.aggregate({
      where: { status: { in: [...disbursedLoanStatuses] } },
      _sum: { principalAmount: true, outstandingAmount: true },
    });
    const totalLoanDisbursed = Number(loanAgg._sum.principalAmount || 0);
    const totalOutstanding = Number(loanAgg._sum.outstandingAmount || 0);
    const recoveryRate =
      totalLoanDisbursed > 0
        ? ((totalLoanDisbursed - totalOutstanding) / totalLoanDisbursed) * 100
        : 0;

    // There is no dedicated member-deposit ledger in the schema yet, so
    // there is no real figure for pigmy/RD/FD deposits. shareCapital is the
    // only real per-member currency balance the society tracks today —
    // surfaced honestly as "Total Share Capital" rather than fabricating a
    // "deposits" number.
    const shareCapitalAgg = await this.prisma.member.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { shareCapital: true },
    });
    const totalShareCapital = Number(shareCapitalAgg._sum.shareCapital || 0);

    return {
      stats: {
        totalActiveMembers,
        pendingApprovalsCount: pendingCount,
        totalLoanDisbursed,
        totalShareCapital,
        recoveryRate: Math.round(recoveryRate * 10) / 10,
      },
      pendingApprovals,
      recentActivity,
    };
  }
}
