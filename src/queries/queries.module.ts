import { Module } from '@nestjs/common';
import { QueriesService } from './queries.service.js';
import { MemberQueriesController } from './controllers/member-queries.controller.js';
import { AdminQueriesController } from './controllers/admin-queries.controller.js';

@Module({
  controllers: [MemberQueriesController, AdminQueriesController],
  providers: [QueriesService],
})
export class QueriesModule {}
