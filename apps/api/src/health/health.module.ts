import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';

// PrismaModule is @Global (see infra/prisma), so ReadinessService can inject
// PrismaService for its `SELECT 1` readiness probe without importing it here.
@Module({
  controllers: [HealthController],
  providers: [HealthService, ReadinessService],
})
export class HealthModule {}
