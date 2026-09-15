import { Module } from '@nestjs/common';
import { SlaService } from './sla.service';

/**
 * Exports SlaService for TicketsModule to consume (dependency direction
 * `tickets -> sla` only — see ADR-020). No controllers yet; those are
 * added in a later Phase 7 commit once the read endpoints are built.
 */
@Module({
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
