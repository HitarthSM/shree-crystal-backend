import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActionType, MemberStatus } from '@prisma/client';
import { MembersService } from './members.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService, NotificationsService } from '../../common/services/index';
import {
  ActionHandler,
  PendingActionsService,
} from '../../pending-actions/pending-actions.service';

describe('MembersService approval handlers', () => {
  const handlers = new Map<ActionType, ActionHandler>();
  const tx = {
    member: { update: jest.fn().mockResolvedValue({ id: 'm1' }) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    member: { update: jest.fn().mockResolvedValue({ id: 'm1' }) },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService;
  const pendingActions = {
    registerHandler: (type: ActionType, handler: ActionHandler) => handlers.set(type, handler),
  } as unknown as PendingActionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
    new MembersService(
      prisma,
      {} as EncryptionService,
      {} as NotificationsService,
      pendingActions,
      {} as ConfigService,
    );
  });

  it('registers handlers for member edits and status changes', () => {
    expect(handlers.has(ActionType.MEMBER_EDIT)).toBe(true);
    expect(handlers.has(ActionType.MEMBER_STATUS_CHANGE)).toBe(true);
  });

  it('writes only whitelisted fields on an approved edit', async () => {
    await handlers.get(ActionType.MEMBER_EDIT)!({
      memberId: 'm1',
      reason: 'fix',
      changes: { city: 'Surat', passwordHash: 'x', status: 'ACTIVE' },
    });

    const data = (prisma.member.update as jest.Mock).mock.calls[0][0].data;
    expect(data.city).toBe('Surat');
    expect(data).not.toHaveProperty('passwordHash');
    expect(data).not.toHaveProperty('status');
  });

  it('signs a suspended member out of every device in the same transaction', async () => {
    await handlers.get(ActionType.MEMBER_STATUS_CHANGE)!({
      memberId: 'm1',
      newStatus: MemberStatus.SUSPENDED,
      reason: 'audit',
    });

    expect(tx.member.update).toHaveBeenCalled();
    expect(tx.authSession.updateMany.mock.calls[0][0].where).toEqual({
      memberId: 'm1',
      revokedAt: null,
    });
  });

  it('does not revoke sessions when a member is reactivated', async () => {
    await handlers.get(ActionType.MEMBER_STATUS_CHANGE)!({
      memberId: 'm1',
      newStatus: MemberStatus.ACTIVE,
      reason: 'cleared',
    });

    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown status', async () => {
    await expect(
      handlers.get(ActionType.MEMBER_STATUS_CHANGE)!({
        memberId: 'm1',
        newStatus: 'DELETED',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
