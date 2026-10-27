import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, ActionType, PendingActionStatus } from '@prisma/client';

export type ActionHandler = (
  payload: Prisma.InputJsonValue,
  reviewedById?: string,
) => Promise<void>;

@Injectable()
export class PendingActionsService {
  private handlers = new Map<ActionType, ActionHandler>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a handler for a specific ActionType.
   * Modules should call this during their onModuleInit.
   */
  registerHandler(type: ActionType, handler: ActionHandler) {
    if (this.handlers.has(type)) {
      throw new Error(`Handler for ActionType ${type} is already registered.`);
    }
    this.handlers.set(type, handler);
  }

  /**
   * Check if a specific action type requires maker-checker approval.
   * Queries the Settings table. Defaults to true if setting is not found.
   */
  async isMakerCheckerRequired(type: ActionType): Promise<boolean> {
    const key = `maker_checker.required.${type}`;
    const setting = await this.prisma.setting.findUnique({
      where: { key },
    });

    if (!setting) {
      // Default to true for safety
      return true;
    }

    // Assume value is stored as a boolean or string 'true'/'false'
    const value = setting.value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return true; // fallback
  }

  /**
   * Propose an action. Creates a PENDING record.
   */
  async propose(actionType: ActionType, payload: Prisma.InputJsonValue, requestedById: string) {
    return this.prisma.pendingAction.create({
      data: {
        actionType,
        payload,
        requestedById,
        status: PendingActionStatus.PENDING,
      },
    });
  }

  /**
   * Approve a pending action.
   */
  async approve(pendingActionId: string, reviewedById: string) {
    const pendingAction = await this.prisma.pendingAction.findUnique({
      where: { id: pendingActionId },
    });

    if (!pendingAction) {
      throw new NotFoundException('Pending action not found');
    }

    if (pendingAction.status !== PendingActionStatus.PENDING) {
      throw new BadRequestException(`Cannot approve action that is ${pendingAction.status}`);
    }

    if (pendingAction.requestedById === reviewedById) {
      throw new BadRequestException('Maker cannot approve their own submission');
    }

    const handler = this.handlers.get(pendingAction.actionType);
    if (!handler) {
      throw new BadRequestException(
        `No handler registered for action type ${pendingAction.actionType}`,
      );
    }

    // Claim the action atomically (PENDING -> APPROVED) *before* running the handler, so two
    // concurrent approvals cannot both execute it. The loser sees count 0.
    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: pendingActionId, status: PendingActionStatus.PENDING },
      data: {
        status: PendingActionStatus.APPROVED,
        reviewedById,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Action is no longer pending');
    }

    try {
      await handler(pendingAction.payload as Prisma.InputJsonValue, reviewedById);
    } catch (error) {
      // Handler failed: release the claim so the action can be retried.
      await this.prisma.pendingAction.updateMany({
        where: { id: pendingActionId, status: PendingActionStatus.APPROVED },
        data: { status: PendingActionStatus.PENDING, reviewedById: null, resolvedAt: null },
      });
      throw error;
    }

    return this.prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
  }

  /**
   * Reject a pending action.
   */
  async reject(pendingActionId: string, reviewedById: string, reason: string) {
    const pendingAction = await this.prisma.pendingAction.findUnique({
      where: { id: pendingActionId },
    });

    if (!pendingAction) {
      throw new NotFoundException('Pending action not found');
    }

    if (pendingAction.status !== PendingActionStatus.PENDING) {
      throw new BadRequestException(`Cannot reject action that is ${pendingAction.status}`);
    }

    if (pendingAction.requestedById === reviewedById) {
      throw new BadRequestException('Maker cannot reject their own submission');
    }

    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: pendingActionId, status: PendingActionStatus.PENDING },
      data: {
        status: PendingActionStatus.REJECTED,
        reviewedById,
        resolvedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Action is no longer pending');
    }

    return this.prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
  }

  /**
   * List pending actions (optionally filtered by type)
   */
  async findAll(actionType?: ActionType) {
    const where = actionType
      ? { actionType, status: PendingActionStatus.PENDING }
      : { status: PendingActionStatus.PENDING };

    const actions = await this.prisma.pendingAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    return actions.map((action) => ({ ...action, payload: redactPayload(action.payload) }));
  }
}

/** KYC values are stored hashed/encrypted in payloads; approvers only need to know they changed. */
const SENSITIVE_PAYLOAD_KEYS = ['aadhaarHash', 'aadhaarEncrypted', 'panEncrypted'] as const;

function redactPayload(payload: Prisma.JsonValue): Prisma.JsonValue {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const changes = payload['changes'];
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return payload;

  const { aadhaarHash, aadhaarEncrypted, panEncrypted, ...safe } = changes;
  const redacted: Prisma.JsonObject = { ...safe };
  if (aadhaarHash !== undefined || aadhaarEncrypted !== undefined)
    redacted['aadhaar'] = '(changed)';
  if (panEncrypted !== undefined) redacted['pan'] = '(changed)';
  return { ...payload, changes: redacted };
}
