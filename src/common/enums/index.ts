/**
 * Shared enums used across every feature module.
 * Keep values as string literals so they serialise cleanly to JSON / Prisma.
 */

// ── Member ────────────────────────────────────────────────────────────────────

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

// ── Notices ───────────────────────────────────────────────────────────────────

export enum NoticeCategory {
  GENERAL = 'GENERAL',
  AGM = 'AGM',
  CIRCULAR = 'CIRCULAR',
  URGENT = 'URGENT',
  SCHEME_UPDATE = 'SCHEME_UPDATE',
}

export enum NoticeChannel {
  WEBSITE = 'WEBSITE',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

// ── Statements ────────────────────────────────────────────────────────────────

export enum StatementStatus {
  PUBLISHED = 'PUBLISHED',
  WITHDRAWN = 'WITHDRAWN',
  SUPERSEDED = 'SUPERSEDED',
}

// ── Member Queries ────────────────────────────────────────────────────────────

export enum QueryStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

// ── Pending Actions (maker-checker / approval workflow) ───────────────────────

export enum PendingActionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
