import type { Hold as HoldRow, HoldStatus as HoldStatusRow } from '@prisma/client';
import { Hold } from '@/inventory/domain/models/hold.model';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';

/**
 * Translates between the Prisma `hold` row and the `Hold` aggregate. Domain enum
 * values match the DB enum (lowercase), so status is a straight cast. The ONLY
 * place BC-2's write side crosses the Prisma↔domain boundary.
 */
export class HoldMapper {
  static toDomain(row: HoldRow): Hold {
    return Hold.reconstitute({
      id: row.id,
      listingId: row.listingId,
      dateRange: DateRange.reconstitute(row.checkIn, row.checkOut),
      status: row.status as unknown as HoldStatus,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(hold: Hold): HoldRow {
    return {
      id: hold.id,
      listingId: hold.listingId,
      checkIn: hold.dateRange.checkIn,
      checkOut: hold.dateRange.checkOut,
      status: hold.status as unknown as HoldStatusRow,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
    };
  }
}
