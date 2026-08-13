import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { MemberOwnershipGuard } from './member-ownership.guard';
import { AdminRole } from '../enums/index';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildMockContext(opts: {
  userMemberId?: string;
  userRole?: string;
  paramMemberId?: string;
}) {
  const { userMemberId, userRole, paramMemberId } = opts;

  const mockRequest = {
    user: { memberId: userMemberId, role: userRole },
    params: paramMemberId ? { memberId: paramMemberId } : {},
  };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MemberOwnershipGuard', () => {
  let guard: MemberOwnershipGuard;

  beforeEach(() => {
    guard = new MemberOwnershipGuard();
  });

  describe('Member users', () => {
    it('allows access when memberId param matches the authenticated member', () => {
      const ctx = buildMockContext({
        userMemberId: 'member-123',
        paramMemberId: 'member-123',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException when memberId param differs from authenticated member', () => {
      const ctx = buildMockContext({
        userMemberId: 'member-123',
        paramMemberId: 'member-456',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException with status 403 (not 401)', () => {
      const ctx = buildMockContext({
        userMemberId: 'member-123',
        paramMemberId: 'member-999',
      });
      try {
        guard.canActivate(ctx);
        fail('Expected ForbiddenException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getStatus()).toBe(403);
      }
    });

    it('throws ForbiddenException when no memberId route param exists (guard misconfigured)', () => {
      const ctx = buildMockContext({
        userMemberId: 'member-123',
        paramMemberId: undefined, // no param at all
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('Admin users — bypass ownership check', () => {
    it('allows SUPER_ADMIN to access any memberId', () => {
      const ctx = buildMockContext({
        userRole: AdminRole.SUPER_ADMIN,
        paramMemberId: 'member-999',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows OPERATOR to access any memberId', () => {
      const ctx = buildMockContext({
        userRole: AdminRole.OPERATOR,
        paramMemberId: 'member-999',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows VIEWER to access any memberId', () => {
      const ctx = buildMockContext({
        userRole: AdminRole.VIEWER,
        paramMemberId: 'member-999',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('throws ForbiddenException when there is no user on the request', () => {
      const mockRequest = { user: undefined, params: { memberId: 'member-123' } };
      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
