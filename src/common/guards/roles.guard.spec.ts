import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { AdminRole } from '../enums/index';
import { ROLES_KEY } from '../decorators/index';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildMockContext(userRole?: AdminRole | string, requiredRoles?: AdminRole[]) {
  const mockReflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  const mockRequest = {
    user: userRole ? { role: userRole } : undefined,
  };

  const mockContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;

  return { mockReflector, mockContext };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  it('allows any authenticated user when no @Roles() metadata is set', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.VIEWER, undefined);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('allows an empty @Roles([]) decorator (no restriction)', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.VIEWER, []);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('allows access when the user role matches the required role', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.SUPER_ADMIN, [
      AdminRole.SUPER_ADMIN,
    ]);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('allows access when the user role is one of multiple allowed roles', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.OPERATOR, [
      AdminRole.SUPER_ADMIN,
      AdminRole.OPERATOR,
    ]);
    const guard = new RolesGuard(mockReflector);
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('throws ForbiddenException (403) when the role does not match', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.VIEWER, [
      AdminRole.SUPER_ADMIN,
    ]);
    const guard = new RolesGuard(mockReflector);
    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException (403) when there is no user on the request', () => {
    const { mockReflector, mockContext } = buildMockContext(undefined, [AdminRole.OPERATOR]);
    const guard = new RolesGuard(mockReflector);
    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException with the correct HTTP status code (403 not 401)', () => {
    const { mockReflector, mockContext } = buildMockContext(AdminRole.VIEWER, [
      AdminRole.SUPER_ADMIN,
    ]);
    const guard = new RolesGuard(mockReflector);
    try {
      guard.canActivate(mockContext);
      fail('Expected ForbiddenException to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
    }
  });

  it('uses the ROLES_KEY constant (regression guard against key drift)', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
