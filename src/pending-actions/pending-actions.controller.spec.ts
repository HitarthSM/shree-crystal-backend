import { Test, TestingModule } from '@nestjs/testing';
import { PendingActionsController } from './pending-actions.controller';
import { PendingActionsService } from './pending-actions.service';

describe('PendingActionsController', () => {
  let controller: PendingActionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PendingActionsController],
      providers: [
        {
          provide: PendingActionsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PendingActionsController>(PendingActionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
