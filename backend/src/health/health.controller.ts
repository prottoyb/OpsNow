import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Readiness: is this instance able to serve traffic right now? It pings
   * the database, because an API that cannot reach Postgres can answer
   * almost nothing useful. A load balancer should use this to decide
   * whether to route to the instance, and the container health check uses
   * it for the same reason.
   */
  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Liveness: is this process still running and able to answer at all?
   *
   * Deliberately checks NOTHING external, and that is the whole point of
   * having it separate. An orchestrator restarts a container that fails its
   * liveness probe, so pointing liveness at a database ping means a brief
   * Postgres outage rolls every API instance — turning a recoverable
   * dependency blip into an outage of its own, at exactly the moment the
   * database is least able to absorb a reconnect storm.
   *
   * Readiness (`GET /health`) is the one that may fail on a dependency.
   */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
