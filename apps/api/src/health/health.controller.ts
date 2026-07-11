import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@harbourstay/shared';
import { HealthService } from './health.service';
import { ReadinessService, type ReadinessReport } from './readiness.service';

@ApiTags('health')
@Controller('health')
// Exempt from the rate limiter: the ALB / container orchestrator polls these probes
// frequently and from a small set of internal IPs; a 429 here would be read as an
// unhealthy task and cause needless restarts. They expose no sensitive data.
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly readiness: ReadinessService,
  ) {}

  /**
   * LIVENESS — "is the process up?". Contract UNCHANGED since P0 and deliberately so:
   * this is the ALB health-check target (docs/DEPLOY.md), so it must return 200 as
   * long as the process can answer, WITHOUT touching the database. A transient DB
   * blip must not make ECS kill a healthy task. Do not add dependencies here.
   */
  @Get()
  @ApiOkResponse({ description: 'Process is up (liveness).' })
  check(): HealthResponse {
    return this.health.check();
  }

  /**
   * READINESS — "can this instance serve traffic right now?", i.e. is Postgres
   * reachable. DB up → 200 with the report; DB down → 503 (via
   * `ServiceUnavailableException`, whose body is the same report shape). A 503 tells
   * a readiness-aware balancer to stop routing to this task until the DB returns —
   * WITHOUT killing it (that's what liveness is for).
   *
   * FOLLOW-UP (not done here): this is the better ALB health-check target than
   * `/health`. Switching the ALB target group to `/health/ready` is a one-line infra
   * change documented for a later deploy — we do not touch docs/DEPLOY.md wiring in
   * this slice beyond this note.
   */
  @Get('ready')
  @ApiOkResponse({ description: 'Instance is ready to serve traffic (DB reachable).' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is down (e.g. database unreachable).' })
  async ready(): Promise<ReadinessReport> {
    const report = await this.readiness.check();
    if (report.status !== 'ready') {
      // 503 with the report as the response body.
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
