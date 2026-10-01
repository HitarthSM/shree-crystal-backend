import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, ActionType, PendingActionStatus } from '@prisma/client';

export type ActionHandler = (payload: Prisma.InputJsonValue, checkedById?: string) => Promise<void>;

@Injectable()
export class PendingActionService {
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
    const setting = await this.prisma.settings.findUnique({
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
  async propose(actionType: ActionType, payload: Prisma.InputJsonValue, madeById: string) {
    return this.prisma.pendingAction.create({
      data: {
        actionType,
        payload,
        madeById,
        status: PendingActionStatus.PENDING,
      },
    });
  }

  /**
   * Approve a pending action.
   */
  async approve(pendingActionId: string, checkedById: string) {
    const pendingAction = await this.prisma.pendingAction.findUnique({
      where: { id: pendingActionId },
    });

    if (!pendingAction) {
      throw new NotFoundException('Pending action not found');
    }

    if (pendingAction.status !== PendingActionStatus.PENDING) {
      throw new BadRequestException(`Cannot approve action that is ${pendingAction.status}`);
    }

    if (pendingAction.madeById === checkedById) {
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
        checkedById,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Action is no longer pending');
    }

    try {
      await handler(pendingAction.payload as Prisma.InputJsonValue, checkedById);
    } catch (error) {
      // Handler failed: release the claim so the action can be retried.
      await this.prisma.pendingAction.updateMany({
        where: { id: pendingActionId, status: PendingActionStatus.APPROVED },
        data: { status: PendingActionStatus.PENDING, checkedById: null, resolvedAt: null },
      });
      throw error;
    }

    return this.prisma.pendingAction.findUniqueOrThrow({ where: { id: pendingActionId } });
  }

  /**
   * Reject a pending action.
   */
  async reject(pendingActionId: string, checkedById: string, reason: string) {
    const pendingAction = await this.prisma.pendingAction.findUnique({
      where: { id: pendingActionId },
    });

    if (!pendingAction) {
      throw new NotFoundException('Pending action not found');
    }

    if (pendingAction.status !== PendingActionStatus.PENDING) {
      throw new BadRequestException(`Cannot reject action that is ${pendingAction.status}`);
    }

    if (pendingAction.madeById === checkedById) {
      throw new BadRequestException('Maker cannot reject their own submission');
    }

    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: pendingActionId, status: PendingActionStatus.PENDING },
      data: {
        status: PendingActionStatus.REJECTED,
        checkedById,
        resolvedAt: new Date(),
        checkerNote: reason,
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

    return this.prisma.pendingAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        madeBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
