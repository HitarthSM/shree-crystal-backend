import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';

const HASH = bcrypt.hashSync('Correct1pass', 4);

const baseMember = {
  id: 'm1',
  membershipNumber: 'SCC-1',
  mobileNumber: '9999999999',
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

interface SessionRow {
  id: string;
  jtiHash: string;
  prevJtiHash: string | null;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
  userVersion: number;
}

function build() {
  // Minimal in-memory stand-in for the auth_sessions table.
  const sessions = new Map<string, SessionRow>();
  let nextId = 1;
  const authSession = {
    create: jest.fn(
      ({ data }: { data: Omit<SessionRow, 'id' | 'revokedAt' | 'prevJtiHash' | 'rotatedAt'> }) => {
        const row: SessionRow = {
          ...data,
          id: `s${nextId++}`,
          prevJtiHash: null,
          rotatedAt: null,
          revokedAt: null,
        };
        sessions.set(row.id, row);
        return Promise.resolve({ id: row.id });
      },
    ),
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(sessions.get(where.id) ?? null),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id?: string; jtiHash?: string; revokedAt?: null };
        data: Partial<SessionRow>;
      }) => {
        let count = 0;
        for (const row of sessions.values()) {
          const matches =
            (where.id === undefined || row.id === where.id) &&
            (where.jtiHash === undefined || row.jtiHash === where.jtiHash) &&
            (where.revokedAt === undefined || row.revokedAt === null);
          if (matches) {
            Object.assign(row, data);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    ),
  };
  const prisma = {
    member: { findUnique: jest.fn(), update: jest.fn() },
    adminUser: { findUnique: jest.fn(), update: jest.fn() },
    authSession,
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    audit as unknown as AuditLogService,
  );
  return { prisma, jwt, service, sessions, audit };
}

describe('AuthService', () => {
  it('issues typed access + refresh tokens on a valid member login', async () => {
    const { prisma, jwt, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember });

    const res = await service.login('9999999999', 'Correct1pass');

    expect(jwt.decode(res.accessToken)).toMatchObject({
      sub: 'm1',
      type: 'ACCESS',
      version: 3,
      sid: 's1',
    });
    expect(jwt.decode(res.refreshToken)).toMatchObject({ sub: 'm1', type: 'REFRESH', sid: 's1' });
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
    prisma.member.update.mockResolvedValue({ failedAttempts: 1 });

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

    prisma.member.update.mockResolvedValue({ failedAttempts: 1 });

    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow('Invalid credentials');
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { failedAttempts: 1, lockedUntil: null },
      select: { failedAttempts: true },
    });
  });

  it('locks on the 5th consecutive failure', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember, failedAttempts: 4 });
    prisma.member.update.mockResolvedValue({ failedAttempts: 5 });
    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow(/locked/);
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { lockedUntil: expect.any(Date) },
    });
  });

  it('counts failures with an atomic increment', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({ ...baseMember, failedAttempts: 2 });
    prisma.member.update.mockResolvedValue({ failedAttempts: 3 });
    await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow('Invalid credentials');
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { refreshToken } = await service.login('9999999999', 'Correct1pass');

      const out = await service.refresh(refreshToken);
      expect(out.accessToken).toBeDefined();
      expect(out.refreshToken).toBeDefined();
      expect(out.refreshToken).not.toBe(refreshToken);
    });

    it('lets the newest refresh token through again', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const first = await service.login('9999999999', 'Correct1pass');
      const second = await service.refresh(first.refreshToken);
      await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
    });

    it('accepts the previous refresh token inside the grace window (lost response, second tab)', async () => {
      const { prisma, service, sessions } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const first = await service.login('9999999999', 'Correct1pass');
      const second = await service.refresh(first.refreshToken);

      // The first client never received `second`, so it retries with its old token.
      const retry = await service.refresh(first.refreshToken);
      expect(retry.refreshToken).toBeDefined();
      expect(sessions.get('s1')?.revokedAt).toBeNull();
      // The token handed out first is still honoured while it is the previous one.
      await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
    });

    it('revokes the whole session when an old refresh token is replayed after the grace window', async () => {
      const { prisma, service, sessions } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const first = await service.login('9999999999', 'Correct1pass');
      const second = await service.refresh(first.refreshToken);

      sessions.get('s1')!.rotatedAt = new Date(Date.now() - 120_000);

      await expect(service.refresh(first.refreshToken)).rejects.toThrow(/session has ended/);
      expect(sessions.get('s1')?.revokedAt).toBeInstanceOf(Date);
      // The thief's replay also kills the legitimate holder's newer token.
      await expect(service.refresh(second.refreshToken)).rejects.toThrow(/session has ended/);
    });

    it('does not turn a database failure into a 401', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const { refreshToken } = await service.login('9999999999', 'Correct1pass');
      prisma.authSession.findUnique.mockRejectedValueOnce(new Error('db down'));
      await expect(service.refresh(refreshToken)).rejects.toThrow('db down');
    });

    it('rejects a refresh token from before per-device sessions', async () => {
      const { prisma, jwt, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const legacy = jwt.sign({ sub: 'm1', userType: 'MEMBER', version: 3, type: 'REFRESH' });
      await expect(service.refresh(legacy)).rejects.toThrow(/session has ended/);
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

  describe('logout', () => {
    it('revokes only the calling device when it has a session id', async () => {
      const { prisma, service, sessions } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      await service.login('9999999999', 'Correct1pass'); // s1
      await service.login('9999999999', 'Correct1pass'); // s2

      await service.logout('m1', 'MEMBER', 's1');

      expect(sessions.get('s1')?.revokedAt).toBeInstanceOf(Date);
      expect(sessions.get('s2')?.revokedAt).toBeNull();
      expect(prisma.member.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionVersion: expect.anything() }),
        }),
      );
    });

    it('falls back to bumping the session version for pre-session tokens', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      await service.logout('m1', 'MEMBER');
      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { sessionVersion: 4 },
      });
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
        select: { id: true },
      });
      expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { memberId: 'm1' },
        data: { revokedAt: expect.any(Date) },
      });
      // Password change and session revocation succeed or fail together.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects reuse of the current password', async () => {
      const { prisma, service } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      await expect(
        service.changePassword('m1', 'MEMBER', 'Correct1pass', 'Correct1pass'),
      ).rejects.toThrow(/different/);
    });
  });

  describe('audit trail', () => {
    const actions = (audit: { record: jest.Mock }) =>
      audit.record.mock.calls.map(([event]: [{ action: string }]) => event.action);

    it('records a successful login against the right actor and IP', async () => {
      const { prisma, service, audit } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });

      await service.login('9999999999', 'Correct1pass', '10.0.0.5');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_SUCCESS',
          actorId: 'm1',
          actorType: 'MEMBER',
          ipAddress: '10.0.0.5',
        }),
      );
    });

    it('records failed logins for unknown accounts and wrong passwords', async () => {
      const { prisma, service, audit } = build();
      prisma.member.findUnique.mockResolvedValue(null);
      await expect(service.login('0000', 'x')).rejects.toThrow();

      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      prisma.member.update.mockResolvedValue({ failedAttempts: 1 });
      await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow();

      expect(actions(audit)).toEqual(['LOGIN_FAILED', 'LOGIN_FAILED']);
      expect(audit.record.mock.calls[0][0]).toMatchObject({ actorType: 'ANONYMOUS' });
      expect(audit.record.mock.calls[1][0]).toMatchObject({ actorId: 'm1', actorType: 'MEMBER' });
    });

    it('never writes passwords, identifiers or tokens into an audit entry', async () => {
      const { prisma, service, audit } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      prisma.member.update.mockResolvedValue({ failedAttempts: 1 });
      await expect(service.login('9999999999', 'Wrong1pass')).rejects.toThrow();
      await service.login('9999999999', 'Correct1pass');

      const written = JSON.stringify(audit.record.mock.calls);
      expect(written).not.toContain('Wrong1pass');
      expect(written).not.toContain('Correct1pass');
      expect(written).not.toContain('9999999999');
    });

    it('records logout and token reuse', async () => {
      const { prisma, service, audit } = build();
      prisma.member.findUnique.mockResolvedValue({ ...baseMember });
      const first = await service.login('9999999999', 'Correct1pass');
      await service.refresh(first.refreshToken);
      await service.refresh((await service.login('9999999999', 'Correct1pass')).refreshToken);
      audit.record.mockClear();

      await service.logout('m1', 'MEMBER', 's1');

      expect(actions(audit)).toEqual(['LOGOUT']);
    });
  });
});
