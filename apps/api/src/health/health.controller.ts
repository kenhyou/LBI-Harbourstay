import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@harbourstay/shared';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
// Exempt from the rate limiter: the ALB / container orchestrator polls this liveness
// probe frequently and from a small set of internal IPs; a 429 here would be read as
// an unhealthy task and cause needless restarts. It exposes no sensitive data.
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): HealthResponse {
    return this.health.check();
  }
}
