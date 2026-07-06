import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { HoldMapper } from '@/inventory/infra/mappers/hold.mapper';
import { Hold } from '@/inventory/domain/models/hold.model';
import { OverlappingHoldException } from '@/inventory/domain/exceptions/overlapping-hold.exception';

/** Postgres SQLSTATE for `exclusion_violation` — raised by the EXCLUDE constraint. */
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * Prisma-backed write repository for the `Hold` aggregate (BC-2). Reads the
 * transactional client from `TransactionHost` so a `save` inside a
 * `@Transactional`/`TransactionManagerPort.run` joins the ambient transaction
 * (the Partnership seam with Booking); outside one it uses the base client.
 *
 * THE overbooking guarantee is caught here: an insert that trips the
 * `no_overlapping_holds` EXCLUDE fails with SQLSTATE `23P01`, which we translate
 * into `OverlappingHoldException` so no vendor error leaks past infra.
 */
@Injectable()
export class HoldRepository extends HoldRepositoryPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async save(hold: Hold): Promise<void> {
    const data = HoldMapper.toPersistence(hold);
    try {
      await this.txHost.tx.hold.upsert({
        where: { id: data.id },
        create: data,
        update: { status: data.status, expiresAt: data.expiresAt },
      });
    } catch (error) {
      if (this.isExclusionViolation(error)) {
        throw new OverlappingHoldException(hold.listingId);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Hold | null> {
    const row = await this.txHost.tx.hold.findUnique({ where: { id } });
    return row ? HoldMapper.toDomain(row) : null;
  }

  /**
   * Prisma raises the EXCLUDE conflict as a `P2010` raw-query-ish error OR a
   * `PrismaClientUnknownRequestError`; in all cases the Postgres SQLSTATE `23P01`
   * is present in the driver payload. Match on the code string defensively.
   */
  private isExclusionViolation(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.meta?.code === PG_EXCLUSION_VIOLATION ||
        error.code === PG_EXCLUSION_VIOLATION)
    ) {
      return true;
    }
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    return (
      message.includes(PG_EXCLUSION_VIOLATION) ||
      message.includes('no_overlapping_holds')
    );
  }
}
