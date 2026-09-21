import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL_SECONDS,
  validateEnv,
} from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { TicketsModule } from './tickets/tickets.module';
import { AssetTypesModule } from './asset-types/asset-types.module';
import { AssetsModule } from './assets/assets.module';
import { KnowledgeBaseCategoriesModule } from './knowledge-base-categories/knowledge-base-categories.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    /*
     * Configured here, but deliberately NOT registered as an APP_GUARD
     * (ADR-026): ThrottlerGuard is applied only to the three
     * unauthenticated auth routes, in AuthController. A global throttle
     * on an authenticated ITSM API would rate-limit a busy agent's normal
     * work, and the brute-force exposure this closes is specific to the
     * endpoints that accept credentials or mint tokens.
     *
     * Storage is the default in-memory one, so the counter is per
     * process. With more than one backend replica the effective limit is
     * the configured limit times the replica count — see ADR-026's Risks.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'auth',
            ttl:
              configService.get<number>(
                'AUTH_THROTTLE_TTL_SECONDS',
                DEFAULT_AUTH_THROTTLE_TTL_SECONDS,
              ) * 1000,
            limit: configService.get<number>(
              'AUTH_THROTTLE_LIMIT',
              DEFAULT_AUTH_THROTTLE_LIMIT,
            ),
          },
        ],
      }),
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    TicketCategoriesModule,
    TicketsModule,
    AssetTypesModule,
    AssetsModule,
    KnowledgeBaseCategoriesModule,
    KnowledgeBaseModule,
    AnalyticsModule,
    AuditModule,
    AiModule,
  ],
})
export class AppModule {}
