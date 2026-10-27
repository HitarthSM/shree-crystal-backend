import { RateEntityType } from '@prisma/client';
import { RateSchedulerService } from './rate-scheduler.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('RateSchedulerService', () => {
  const history = (entityId: string, newRate: number) => ({
    entityId,
    entityType: RateEntityType.LOAN_TYPE,
    newRate,
  });

  const build = (rows: ReturnType<typeof history>[]) => {
    const loanTypeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      rateHistory: { findMany: jest.fn().mockResolvedValue(rows) },
      loanType: { updateMany: loanTypeUpdateMany },
      depositScheme: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;
    return { service: new RateSchedulerService(prisma), loanTypeUpdateMany };
  };

  it('applies only the latest due rate per scheme, never the older ones', async () => {
    const { service, loanTypeUpdateMany } = build([history('a', 10), history('a', 12)]);

    await service.applyFutureRates();

    expect(loanTypeUpdateMany).toHaveBeenCalledTimes(1);
    expect(loanTypeUpdateMany.mock.calls[0][0].data).toEqual({ interestRate: 12 });
  });

  it('handles each scheme independently', async () => {
    const { service, loanTypeUpdateMany } = build([
      history('a', 10),
      history('b', 9),
      history('a', 12),
    ]);

    await service.applyFutureRates();

    const rates = loanTypeUpdateMany.mock.calls.map(([arg]) => [
      arg.where.id,
      arg.data.interestRate,
    ]);
    expect(rates).toEqual(
      expect.arrayContaining([
        ['a', 12],
        ['b', 9],
      ]),
    );
    expect(rates).toHaveLength(2);
  });
});
