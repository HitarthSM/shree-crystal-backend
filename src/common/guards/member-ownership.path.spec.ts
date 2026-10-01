import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MemberOwnershipGuard } from './member-ownership.guard';

const ctxFor = (path: string) =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: { memberId: 'SCC-1' }, params: {}, path }),
    }),
  }) as unknown as ExecutionContext;

describe('MemberOwnershipGuard — /me detection', () => {
  const guard = new MemberOwnershipGuard();

  it.each(['/api/members/me', '/api/statements/me/abc/download', '/api/queries/me/q1'])(
    'treats %s as self-scoped',
    (path) => expect(guard.canActivate(ctxFor(path))).toBe(true),
  );

  it.each(['/api/members/other', '/api/messages/x', '/api/members', '/api/measure'])(
    'does not treat %s as self-scoped (substring "/me" is not a segment)',
    (path) => expect(() => guard.canActivate(ctxFor(path))).toThrow(ForbiddenException),
  );
});
