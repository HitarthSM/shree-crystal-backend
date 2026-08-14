import { Module } from '@nestjs/common';
import { NoticesService } from './notices.service.js';
import { NoticesController } from './notices.controller.js';
import { MemberNoticesController } from './member-notices.controller.js';

@Module({
  controllers: [NoticesController, MemberNoticesController],
  providers: [NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
