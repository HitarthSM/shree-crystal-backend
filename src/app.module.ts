import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { envValidationSchema } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PendingActionModule } from './pending-action/pending-action.module';
import { AdminUsersModule } from './admin-users/admin-users.module.js';
import { MembersModule } from './members/members.module.js';
import { StatementsModule } from './statements/statements.module.js';
import { ActivityLogModule } from './activity-log/activity-log.module.js';
import { LoanConfigModule } from './loan-config/loan-config.module.js';
import { QueriesModule } from './queries/queries.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { NotificationModule } from './common/services/notification.module.js';
import { NoticesModule } from './notices/notices.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
@Module({
  imports: [
    // ── Config (global, validated) ─────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false, // report ALL missing vars at once
      },
    }),

    // ── Rate limiting (global default: 100 req / 60 s) ────────────────────
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 100,
        },
      ],
    }),

    // ── Scheduled tasks ───────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Prisma (global DB client) ─────────────────────────────────────────
    PrismaModule,

    // ── Health check ──────────────────────────────────────────────────────
    // ── Health check ──────────────────────────────────────────────────────
    HealthModule,

    // ── Authentication ────────────────────────────────────────────────────
    AuthModule,

    PendingActionModule,

    SettingsModule,
    NotificationModule,
    NoticesModule,
    AdminUsersModule,
    MembersModule,
    StatementsModule,
    ActivityLogModule,
    LoanConfigModule,
    QueriesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered here so app.get(ResponseInterceptor) / app.get(AuditLogInterceptor)
    // work in main.ts with full NestJS DI (AuditLogInterceptor needs PrismaService).
    ResponseInterceptor,
    AuditLogInterceptor,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
