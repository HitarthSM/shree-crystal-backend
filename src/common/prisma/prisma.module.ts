import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaModule is marked as @Global so PrismaService can be injected
 * anywhere without re-importing this module in every feature module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
