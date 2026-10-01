import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';

const HASH = bcrypt.hashSync('Correct1pass', 4);

const baseMember = {
  id: 'm1',
  memberId: 'SCC-1',
  mobile: '9999999999',
  passwordHash: HASH,
  status: 'ACTIVE',
  failedAttempts: 0,
  lockedUntil: null as Date | null,
  sessionVersion: 3,
  isFirstLogin: false,
};

const baseAdmin = {
  id: 'a1',
  email: 'a@x.com',
  passwordHash: HASH,
  role: 'OPERATOR',
  isActive: true,
  failedAttempts: 0,
  lockedUntil: null as Date | null,
  sessionVersion: 1,
  isFirstLogin: false,
};

function build() {
  const prisma = {
    member: { findUnique: jest.fn(), update: jest.fn() },
    adminUser: { findUnique: jest.fn(), update: jest.fn() },
  };
  const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });
  const service = new AuthService(prisma as unknown as PrismaService, jwt);
  return { prisma, jwt, service };
}

describe('AuthService', () => {
  it('issues typed access + refresh tokens on a valid member login', async () => {
    const { prisma, jwt, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember });

    const res = await service.login('9999999999', 'Correct1pass');

    expect(jwt.decode(res.accessToken)).toMatchObject({ sub: 'm1', type: 'ACCESS', version: 3 });
    expect(jwt.decode(res.refreshToken)).toMatchObject({ sub: 'm1', type: 'REFRESH' });
    expect(res.isFirstLogin).toBe(false);
  });

  it('rejects an unknown identifier with the generic message', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(service.login('0000', 'whatever1A')).rejects.toThrow('Invalid credentials');
  });

  it('does not reveal a suspended account until the password is right', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember, status: 'SUSPENDED' });

    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow('Invalid credentials');
    await expect(service.login('9999999999', 'Correct1pass')).rejects.toThrow(/not active/);
  });

  it('blocks deactivated admins', async () => {
    const { prisma, service } = build();
    prisma.adminUser.findUnique.mockResolvedValue({ ...baseAdmin, isActive: false });
    await expect(service.login('a@x.com', 'Correct1pass')).rejects.toThrow(/not active/);
  });

  it('records lastLoginAt for admins', async () => {
    const { prisma, service } = build();
    prisma.adminUser.findUnique.mockResolvedValue({ ...baseAdmin });
    await service.login('a@x.com', 'Correct1pass');
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({ failedAttempts: 0, lastLoginAt: expect.any(Date) }),
    });
  });

  it('refuses while locked', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({
      ...baseMember,
      lockedUntil: new Date(Date.now() + 60_000),
    });
    await expect(service.login('9999999999', 'Correct1pass')).rejects.toThrow(/locked/);
  });

  it('starts a fresh count once a previous lock has expired', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({
      ...baseMember,
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() - 1000),
    });

    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow('Invalid credentials');
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { failedAttempts: 1, lockedUntil: null },
    });
  });

  it('locks on the 5th consecutive failure', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember, failedAttempts: 4 });
    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow(/locked/);
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { refreshToken } = await service.login('9999999999', 'Correct1pass');

      const out = await service.refresh(refreshToken);
      expect(out.accessToken).toBeDefined();
      expect(out.refreshToken).toBeDefined();
    });

    it('rejects an access token presented as a refresh token', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { accessToken } = await service.login('9999999999', 'Correct1pass');
      await expect(service.refresh(accessToken)).rejects.toThrow('Invalid refresh token');
    });

    it('rejects after the session version changed', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { refreshToken } = await service.login('9999999999', 'Correct1pass');
      prisma.member.findUnique.mockResolvedValue({ ...baseMember, sessionVersion: 4 });
      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a suspended member', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { refreshToken } = await service.login('9999999999', 'Correct1pass');
      prisma.member.findUnique.mockResolvedValue({ ...baseMember, status: 'SUSPENDED' });
      await expect(service.refresh(refreshToken)).rejects.toThrow(/not active/);
    });
  });

  describe('changePassword', () => {
    it('returns a fresh token pair carrying the bumped session version', async () => {
      const { prisma, jwt, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });

      const out = await service.changePassword('m1', 'MEMBER', 'Correct1pass', 'Newpass123');
      expect(jwt.decode(out.accessToken)).toMatchObject({ version: 4, type: 'ACCESS' });
      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({ sessionVersion: 4, isFirstLogin: false }),
      });
    });

    it('rejects reuse of the current password', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      await expect(
        service.changePassword('m1', 'MEMBER', 'Correct1pass', 'Correct1pass'),
      ).rejects.toThrow(/different/);
    });
  });
});
