import { Test, TestingModule } from '@nestjs/testing';
import { LoanConfigController } from './loan-config.controller';

describe('LoanConfigController', () => {
  let controller: LoanConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoanConfigController],
    }).compile();

    controller = module.get<LoanConfigController>(LoanConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
