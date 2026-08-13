import { Module } from '@nestjs/common';
import { QueriesService } from './queries.service.js';
import { MemberQueriesController } from './controllers/member-queries.controller.js';
import { AdminQueriesController } from './controllers/admin-queries.controller.js';
import { NotificationService } from '../common/services/notification.service.js';

@Module({
  controllers: [MemberQueriesController, AdminQueriesController],
  providers: [QueriesService, NotificationService],
})
export class QueriesModule {}
