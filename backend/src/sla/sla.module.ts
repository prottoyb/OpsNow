import { Module } from '@nestjs/common';
import { SlaController } from './sla.controller';
import { SlaService } from './sla.service';

/**
 * Exports SlaService for TicketsModule to consume (dependency direction
 * `tickets -> sla` only — see ADR-020). SlaController owns the two
 * staff-only read routes (`GET /sla-policies`, `GET /sla/metrics`); there
 * is no policy CRUD in Phase 7.
 */
@Module({
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
