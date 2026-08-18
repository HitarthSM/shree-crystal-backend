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

    // Execute the action in a transaction to ensure atomicity of the update and the action.
    // However, the handler might have its own transaction logic.
    // Usually handlers manage their own DB updates. If the handler fails, we throw and don't mark as approved.
    await handler(pendingAction.payload as Prisma.InputJsonValue, checkedById);

    return this.prisma.pendingAction.update({
      where: { id: pendingActionId },
      data: {
        status: PendingActionStatus.APPROVED,
        checkedById,
        resolvedAt: new Date(),
      },
    });
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

    return this.prisma.pendingAction.update({
      where: { id: pendingActionId },
      data: {
        status: PendingActionStatus.REJECTED,
        checkedById,
        resolvedAt: new Date(),
        checkerNote: reason,
      },
    });
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
