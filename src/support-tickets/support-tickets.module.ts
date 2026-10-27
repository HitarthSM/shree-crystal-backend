import { Module } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service.js';
import { MemberSupportTicketsController } from './controllers/member-support-tickets.controller.js';
import { AdminSupportTicketsController } from './controllers/admin-support-tickets.controller.js';

@Module({
  controllers: [MemberSupportTicketsController, AdminSupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
