import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * The shape of a readiness report. This is an OPERATIONAL endpoint (consumed by the
 * ALB / orchestrator, not the web app), so unlike `/health` it does NOT go through
 * the shared Zod contract — nothing in `apps/web` parses it. Keeping it local avoids
 * polluting the Shared Kernel with an ops-only type.
 */
export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: {
    /** Can we reach Postgres right now? */
    database: 'up' | 'down';
  };
}

/**
 * S7b — READINESS (as opposed to liveness).
 *
 * Liveness (`GET /health`, P0) answers "is the process up?" — it must stay cheap and
 * dependency-free because it is the ALB health-check target (see docs/DEPLOY.md): a
 * transient DB blip must NOT make ECS kill an otherwise-healthy task.
 *
 * Readiness answers a different question — "can this instance actually serve traffic
 * right now?" — which for us means "is the database reachable?". A load balancer that
 * routes on readiness will pull a DB-disconnected task out of rotation without
 * killing it, then bring it back when the DB returns.
 *
 * Hand-rolled rather than pulling in `@nestjs/terminus`: the only dependency worth
 * probing today is Postgres, and a single `SELECT 1` is clearer to read than a
 * health-indicator abstraction. If we later add Redis / an external API, `terminus`
 * becomes worth its weight — noted as a possible follow-up.
 */
@Injectable()
export class ReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Probe every dependency this instance needs to serve traffic. Returns a report
   * rather than throwing so the controller decides the HTTP status — that keeps the
   * "what did we check" logic here and the "how do we speak HTTP" logic in the
   * presenter.
   *
   * `SELECT 1` is the canonical cheapest connectivity check: it forces a real round
   * trip to Postgres (proving the pool can hand out a live connection) without
   * touching any table.
   */
  async check(): Promise<ReadinessReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', checks: { database: 'up' } };
    } catch {
      // Swallow the driver error on purpose: a readiness probe reports UP/DOWN, it
      // does not surface DB internals to an unauthenticated caller. The underlying
      // error is still logged by Prisma / the global logger.
      return { status: 'not_ready', checks: { database: 'down' } };
    }
  }
}
