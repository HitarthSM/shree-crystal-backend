import { Module } from '@nestjs/common';
import { NoticesService } from './notices.service.js';

@Module({
  providers: [NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
