import { Test, TestingModule } from '@nestjs/testing';
import { NoticesService } from './notices.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { GATEWAY_TOKEN } from '../common/services/gateways/gateway.token.js';
import { DeliveryStatus, NoticeChannel } from '@prisma/client';

describe('NoticesService', () => {
  let service: NoticesService;
  let prismaService: PrismaService;

  // Mock Gateway to simulate partial failure
  const mockGateway = {
    sendSms: jest.fn().mockImplementation(async (to: string) => {
      if (to === 'invalid') {
        throw new Error('Invalid mobile number');
      }
      return true;
    }),
    sendEmail: jest.fn().mockResolvedValue(true),
  };

  const mockPrisma = {
    noticeDelivery: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GATEWAY_TOKEN, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<NoticesService>(NoticesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should deliver to valid numbers and record individual failures for invalid ones in a batch', async () => {
    const noticeId = 'notice-123';

    // Create 50 dummy deliveries: 48 valid, 2 invalid
    const deliveries = Array.from({ length: 50 }).map((_, i) => ({
      id: `delivery-${i}`,
      noticeId,
      status: DeliveryStatus.PENDING,
      channel: NoticeChannel.SMS,
      member: {
        memberId: `M-${i}`,
        mobile: i < 48 ? `+10000000${i}` : 'invalid',
      },
    }));

    mockPrisma.noticeDelivery.findMany.mockResolvedValue(deliveries);

    // Run the dispatch
    await expect(service.dispatchNotice(noticeId)).resolves.not.toThrow();

    // Verify 50 gateway calls were made
    expect(mockGateway.sendSms).toHaveBeenCalledTimes(50);

    // Verify 50 updates were made
    expect(mockPrisma.noticeDelivery.update).toHaveBeenCalledTimes(50);

    // Verify 48 successes
    const successfulUpdates = mockPrisma.noticeDelivery.update.mock.calls.filter(
      (call) => call[0].data.status === DeliveryStatus.DELIVERED,
    );
    expect(successfulUpdates).toHaveLength(48);

    // Verify 2 failures with error messages
    const failedUpdates = mockPrisma.noticeDelivery.update.mock.calls.filter(
      (call) => call[0].data.status === DeliveryStatus.FAILED,
    );
    expect(failedUpdates).toHaveLength(2);
    expect(failedUpdates[0][0].data.errorMsg).toBe('Invalid mobile number');
    expect(failedUpdates[1][0].data.errorMsg).toBe('Invalid mobile number');
  });
});
