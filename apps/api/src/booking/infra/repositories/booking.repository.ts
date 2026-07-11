import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingMapper } from '@/booking/infra/mappers/booking.mapper';
import { Booking } from '@/booking/domain/models/booking.model';

/**
 * Prisma-backed write repository for the `Booking` aggregate (BC-1). Reads the
 * transactional client from `TransactionHost`, so a `save` performed inside the
 * Create-Booking transaction commits atomically with the Hold write (Partnership
 * seam). Prisma lives only here.
 */
@Injectable()
export class BookingRepository extends BookingRepositoryPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async save(booking: Booking): Promise<void> {
    const data = BookingMapper.toPersistence(booking);
    await this.txHost.tx.booking.upsert({
      where: { id: data.id },
      create: data,
      update: {
        status: data.status,
        priceSnapshot: data.priceSnapshot,
        holdExpiresAt: data.holdExpiresAt,
        cancelledAt: data.cancelledAt,
        refundAmount: data.refundAmount,
      },
    });
  }

  async findById(id: string): Promise<Booking | null> {
    const row = await this.txHost.tx.booking.findUnique({ where: { id } });
    return row ? BookingMapper.toDomain(row) : null;
  }
}
