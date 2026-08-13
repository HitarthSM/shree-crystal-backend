import { Test, TestingModule } from '@nestjs/testing';
import { PendingActionService } from './pending-action.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { ActionType, PendingActionStatus } from '@prisma/client';

describe('PendingActionService', () => {
  let service: PendingActionService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingActionService,
        {
          provide: PrismaService,
          useValue: {
            pendingAction: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            settings: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PendingActionService>(PendingActionService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('maker-checker validation', () => {
    it.each(Object.values(ActionType))(
      'should throw BadRequestException if maker attempts to approve their own %s action',
      async (actionType) => {
        const makerId = 'admin-id-123';
        const pendingActionId = 'action-id-456';

        // Mock finding the pending action
        (prismaService.pendingAction.findUnique as jest.Mock).mockResolvedValue({
          id: pendingActionId,
          actionType: actionType,
          status: PendingActionStatus.PENDING,
          madeById: makerId,
          payload: { dummy: 'data' },
        });

        // Attempt to approve as the same admin who made it
        await expect(service.approve(pendingActionId, makerId)).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.approve(pendingActionId, makerId)).rejects.toThrow(
          'Maker cannot approve their own submission',
        );
      },
    );

    it('should proceed to approve if checker is different from maker and handler exists', async () => {
      const makerId = 'admin-id-123';
      const checkerId = 'admin-id-789';
      const pendingActionId = 'action-id-456';

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler(ActionType.MEMBER_STATUS_CHANGE, mockHandler);

      (prismaService.pendingAction.findUnique as jest.Mock).mockResolvedValue({
        id: pendingActionId,
        actionType: ActionType.MEMBER_STATUS_CHANGE,
        status: PendingActionStatus.PENDING,
        madeById: makerId,
        payload: { status: 'ACTIVE' },
      });

      (prismaService.pendingAction.update as jest.Mock).mockResolvedValue({
        id: pendingActionId,
        status: PendingActionStatus.APPROVED,
      });

      await service.approve(pendingActionId, checkerId);

      expect(mockHandler).toHaveBeenCalledWith({ status: 'ACTIVE' }, checkerId);
      expect(prismaService.pendingAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pendingActionId },
          data: expect.objectContaining({
            status: PendingActionStatus.APPROVED,
            checkedById: checkerId,
          }),
        }),
      );
    });
  });
});
