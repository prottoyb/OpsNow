import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Phase 10 — read-only analytics. PrismaModule is global, so it needs no
 * import. No cache, no scheduled job, no new table (ADR-017).
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
