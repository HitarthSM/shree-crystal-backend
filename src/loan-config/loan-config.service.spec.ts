import { Test, TestingModule } from '@nestjs/testing';
import { LoanConfigService } from './loan-config.service';

describe('LoanConfigService', () => {
  let service: LoanConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoanConfigService],
    }).compile();

    service = module.get<LoanConfigService>(LoanConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
