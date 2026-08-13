import { Test, TestingModule } from '@nestjs/testing';
import { QueriesService } from './queries.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationService } from '../common/services/notification.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryStatus, SenderType } from '@prisma/client';

describe('QueriesService', () => {
  let service: QueriesService;
  let prismaService: any;
  let notificationService: any;

  beforeEach(async () => {
    prismaService = {
      supportQuery: {
        findUnique: jest.fn(),
      },
    };

    notificationService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueriesService,
        { provide: PrismaService, useValue: prismaService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<QueriesService>(QueriesService);
  });

  describe('Ownership Constraints', () => {
    it("should throw ForbiddenException when a member tries to view another member's ticket", async () => {
      // Mock a ticket belonging to member 'user-A'
      prismaService.supportQuery.findUnique.mockResolvedValue({
        id: 'ticket-1',
        memberId: 'user-A',
        status: QueryStatus.OPEN,
      });

      // Member 'user-B' tries to access 'ticket-1'
      await expect(service.getMemberQueryById('user-B', 'ticket-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getMemberQueryById('user-B', 'ticket-1')).rejects.toThrow(
        'You do not have permission to access this resource.',
      );
    });

    it("should throw ForbiddenException when a member tries to reply to another member's ticket", async () => {
      prismaService.supportQuery.findUnique.mockResolvedValue({
        id: 'ticket-1',
        memberId: 'user-A',
        status: QueryStatus.OPEN,
      });

      // Member 'user-B' tries to add a message to 'ticket-1'
      await expect(
        service.addMemberMessage('user-B', 'ticket-1', { message: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a member to view their own ticket', async () => {
      const myTicket = {
        id: 'ticket-1',
        memberId: 'user-A',
        status: QueryStatus.OPEN,
        messages: [],
      };
      prismaService.supportQuery.findUnique.mockResolvedValue(myTicket);

      const result = await service.getMemberQueryById('user-A', 'ticket-1');
      expect(result).toEqual(myTicket);
    });
  });
});
