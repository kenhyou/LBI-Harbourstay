import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ReadinessService } from './readiness.service';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Integration test of the readiness probe against a REAL Postgres (Testcontainers).
 * Proves the `SELECT 1` round-trips against a live DB (→ ready), and — since we can
 * cheaply kill the container — that losing the DB flips the probe to `not_ready`
 * (the 503 path the ALB reads). Requires Docker. No migrations needed: `SELECT 1`
 * touches no tables.
 */
jest.setTimeout(180_000);

describe('ReadinessService (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let service: ReadinessService;
  let containerStopped = false;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    prisma = new PrismaClient({
      datasources: { db: { url: container.getConnectionUri() } },
    });
    await prisma.$connect();
    service = new ReadinessService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (!containerStopped) await container?.stop();
  });

  it('reports ready against a live database', async () => {
    const report = await service.check();
    expect(report).toEqual({ status: 'ready', checks: { database: 'up' } });
  });

  it('reports not_ready once the database is gone (the 503 path)', async () => {
    // Kill Postgres out from under the pool; the next probe must fail cleanly.
    await container.stop();
    containerStopped = true;

    const report = await service.check();
    expect(report).toEqual({ status: 'not_ready', checks: { database: 'down' } });
  });
});
