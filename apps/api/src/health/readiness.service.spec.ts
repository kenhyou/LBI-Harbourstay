import { ReadinessService } from './readiness.service';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Unit test of the readiness probe's two outcomes — no DB, no mocks framework, just
 * a hand-rolled `$queryRaw` fake. Proves the DOWN path is handled (the case we most
 * want right: a DB blip must produce a clean `not_ready`, never an unhandled throw).
 */
describe('ReadinessService', () => {
  it('reports ready when the SELECT 1 probe succeeds (DB up)', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;

    const report = await new ReadinessService(prisma).check();

    expect(report).toEqual({ status: 'ready', checks: { database: 'up' } });
  });

  it('reports not_ready (never throws) when the probe rejects (DB down)', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as PrismaService;

    const report = await new ReadinessService(prisma).check();

    expect(report).toEqual({ status: 'not_ready', checks: { database: 'down' } });
  });
});
