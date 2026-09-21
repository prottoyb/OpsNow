import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
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
