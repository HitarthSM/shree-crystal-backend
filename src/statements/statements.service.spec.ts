import { BadRequestException } from '@nestjs/common';
import { StatementsService } from './statements.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const batch = {
  id: 'b1',
  status: 'PENDING',
  period: '2026-09',
  category: 'LOAN',
  matchedCount: 2,
  matchedStatements: [
    { memberId: 'm1', fileUrl: 'statements/a.pdf' },
    { memberId: 'm2', fileUrl: 'statements/b.pdf' },
  ],
};

function build() {
  const tx = {
    statementBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    statement: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 's1', status: 'WITHDRAWN' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    statementBatch: { findUnique: jest.fn().mockResolvedValue(batch) },
    statement: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 's1', memberId: 'm1', period: '2026-09', category: 'LOAN' }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const notifications = {
    sendStatementPublishedNotification: jest.fn().mockResolvedValue(undefined),
  };
  const service = new StatementsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, tx, prisma };
}

describe('StatementsService', () => {
  describe('publishBatch', () => {
    it('claims the batch and creates one statement per match', async () => {
      const { service, tx } = build();

      await service.publishBatch('b1', 'admin1');

      expect(tx.statementBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b1', status: 'PENDING' } }),
      );
      expect(tx.statement.createMany.mock.calls[0][0].data).toHaveLength(2);
    });

    it('loses cleanly when a concurrent publish already claimed the batch', async () => {
      const { service, tx } = build();
      tx.statementBatch.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.publishBatch('b1', 'admin1')).rejects.toThrow(/already published/);
      expect(tx.statement.createMany).not.toHaveBeenCalled();
    });

    it('refuses to create a second live statement for the same member and period', async () => {
      const { service, tx } = build();
      tx.statement.count.mockResolvedValue(1);

      await expect(service.publishBatch('b1', 'admin1')).rejects.toThrow(
        /already have a published/,
      );
      expect(tx.statement.createMany).not.toHaveBeenCalled();
    });
  });

  describe('replaceStatement', () => {
    it('supersedes only a published statement', async () => {
      const { service, tx } = build();

      await service.replaceStatement('s1', 'admin1', {
        fileUrl: 'statements/new.pdf',
        reason: 'typo',
      });

      expect(tx.statement.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1', status: 'PUBLISHED' } }),
      );
      expect(tx.statement.create).toHaveBeenCalled();
    });

    it('rejects replacing a withdrawn or already superseded statement', async () => {
      const { service, tx } = build();
      tx.statement.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.replaceStatement('s1', 'admin1', { fileUrl: 'statements/new.pdf', reason: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.statement.create).not.toHaveBeenCalled();
    });
  });

  describe('withdrawStatement', () => {
    it('rejects withdrawing a statement that is not published', async () => {
      const { service, tx } = build();
      tx.statement.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.withdrawStatement('s1', 'admin1', { reason: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
