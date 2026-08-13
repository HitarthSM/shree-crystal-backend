import { Test, TestingModule } from '@nestjs/testing';
import { PendingActionController } from './pending-action.controller';
import { PendingActionService } from './pending-action.service';

describe('PendingActionController', () => {
  let controller: PendingActionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PendingActionController],
      providers: [
        {
          provide: PendingActionService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PendingActionController>(PendingActionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
