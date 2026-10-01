import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirstLoginGuard } from './first-login.guard';

function ctx(user: unknown, allowed: boolean) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(allowed),
  } as unknown as Reflector;
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new FirstLoginGuard(reflector), context };
}

describe('FirstLoginGuard', () => {
  it('passes public requests (no user)', () => {
    const { guard, context } = ctx(undefined, false);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes users who have already changed their password', () => {
    const { guard, context } = ctx({ isFirstLogin: false }, false);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks first-login users on ordinary routes', () => {
    const { guard, context } = ctx({ isFirstLogin: true }, false);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets first-login users reach @AllowFirstLogin routes', () => {
    const { guard, context } = ctx({ isFirstLogin: true }, true);
    expect(guard.canActivate(context)).toBe(true);
  });
});
