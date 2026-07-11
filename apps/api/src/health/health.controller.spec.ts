import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { ReadinessService, ReadinessReport } from './readiness.service';

/**
 * Unit test of the HealthController presenter logic: the liveness contract is
 * unchanged, and readiness maps its report onto the right HTTP status (200 / 503).
 */
describe('HealthController', () => {
  function makeController(readinessReport: ReadinessReport): HealthController {
    const readiness = { check: jest.fn().mockResolvedValue(readinessReport) };
    return new HealthController(
      new HealthService(),
      readiness as unknown as ReadinessService,
    );
  }

  // ── Liveness — the P0 contract must be intact (deploy-safe: ALB target) ──
  it('liveness returns the unchanged ok contract without touching the DB', () => {
    const controller = makeController({ status: 'ready', checks: { database: 'up' } });

    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('harbourstay-api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  // ── Readiness — DB up → 200 with the report ──
  it('readiness returns the report when the DB is reachable', async () => {
    const controller = makeController({ status: 'ready', checks: { database: 'up' } });

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up' },
    });
  });

  // ── Readiness — DB down → 503 (ServiceUnavailableException) carrying the report ──
  it('readiness throws 503 with the report when the DB is unreachable', async () => {
    const report: ReadinessReport = { status: 'not_ready', checks: { database: 'down' } };
    const controller = makeController(report);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toMatchObject({
      response: report,
      status: 503,
    });
  });
});
