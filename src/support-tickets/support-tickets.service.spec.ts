import { Test, TestingModule } from '@nestjs/testing';
import { SupportTicketsService } from './support-tickets.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StorageService } from '../storage/storage.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketStatus, SenderType } from '@prisma/client';

describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let prismaService: any;
  let notificationService: any;

  beforeEach(async () => {
    prismaService = {
      supportTicket: {
        findUnique: jest.fn(),
      },
    };

    notificationService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: NotificationsService, useValue: notificationService },
        { provide: StorageService, useValue: { exists: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<SupportTicketsService>(SupportTicketsService);
  });

  describe('Ownership Constraints', () => {
    it("should throw ForbiddenException when a member tries to view another member's ticket", async () => {
      // Mock a ticket belonging to member 'user-A'
      prismaService.supportTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        memberId: 'user-A',
        status: TicketStatus.OPEN,
      });

      // Member 'user-B' tries to access 'ticket-1'
      await expect(service.getMemberTicketById('user-B', 'ticket-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getMemberTicketById('user-B', 'ticket-1')).rejects.toThrow(
        'You do not have permission to access this resource.',
      );
    });

    it("should throw ForbiddenException when a member tries to reply to another member's ticket", async () => {
      prismaService.supportTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        memberId: 'user-A',
        status: TicketStatus.OPEN,
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
        status: TicketStatus.OPEN,
        messages: [],
      };
      prismaService.supportTicket.findUnique.mockResolvedValue(myTicket);

      const result = await service.getMemberTicketById('user-A', 'ticket-1');
      expect(result).toEqual(myTicket);
    });
  });
});
