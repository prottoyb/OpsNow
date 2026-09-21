import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Global so AuthModule, TicketsModule, AssetsModule and the RolesGuard can
 * inject AuditService without importing this module — AuditService depends
 * only on the (also global) PrismaService, so no import cycle can form.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
