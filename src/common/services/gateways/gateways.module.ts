import { Global, Module } from '@nestjs/common';
import { DefaultNotificationGateway } from './default-notification.gateway.js';
import { GATEWAY_TOKEN } from './gateway.token.js';
import { SettingsModule } from '../../../settings/settings.module.js';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    {
      provide: GATEWAY_TOKEN,
      useClass: DefaultNotificationGateway,
    },
  ],
  exports: [GATEWAY_TOKEN],
})
export class GatewaysModule {}
