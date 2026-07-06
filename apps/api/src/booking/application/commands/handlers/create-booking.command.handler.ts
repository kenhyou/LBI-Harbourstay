import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { BookingSummary } from '@harbourstay/shared';
import { CreateBookingCommand } from '@/booking/application/commands/create-booking.command';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { toBookingSummary } from '@/booking/application/mappers/booking-summary.mapper';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { Booking } from '@/booking/domain/models/booking.model';
import { DateRange as BookingDateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money as BookingMoney } from '@/booking/domain/vo/money.vo';
import { PartySizeExceedsCapacityException } from '@/booking/domain/exceptions/party-size-exceeds-capacity.exception';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { ListingInventoryPort } from '@/inventory/application/ports/listing-inventory.port';
import { PricingService } from '@/inventory/domain/services/pricing.service';
import { Hold } from '@/inventory/domain/models/hold.model';
import { DateRange as InventoryDateRange } from '@/inventory/domain/vo/date-range.vo';
import { Money as InventoryMoney } from '@/inventory/domain/vo/money.vo';
import { DatesNotAvailableException } from '@/inventory/domain/exceptions/dates-not-available.exception';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

/** Hold TTL (minutes) — the pending-payment window before the hold expires. */
const HOLD_TTL_MINUTES = 15;

/**
 * The Partnership seam (BC-1 Booking + BC-2 Availability). Orchestration only —
 * no business `if`s beyond the cross-aggregate capacity precondition that no
 * single aggregate can own. In ONE transaction (`TransactionManagerPort.run`):
 *
 *   1. load listing capacity + base rate (BC-2)
 *   2. check party size ≤ capacity, and the dates aren't host-blocked
 *   3. quote the all-in price (PricingService)
 *   4. place the Hold (BC-2) — the DB EXCLUDE rejects an overlapping hold here
 *   5. create the Booking (BC-1) referencing the hold, snapshotting the price
 *   6. save both; commit atomically
 *
 * If the Hold save trips the EXCLUDE, `OverlappingHoldException` propagates and
 * the whole transaction rolls back — no orphan Booking, no double-book.
 */
@CommandHandler(CreateBookingCommand)
export class CreateBookingHandler
  implements ICommandHandler<CreateBookingCommand, BookingSummary>
{
  constructor(
    private readonly tx: TransactionManagerPort,
    private readonly listings: ListingInventoryPort,
    private readonly holds: HoldRepositoryPort,
    private readonly bookings: BookingRepositoryPort,
    private readonly pricing: PricingService,
  ) {}

  async execute(command: CreateBookingCommand): Promise<BookingSummary> {
    const checkIn = new Date(`${command.checkIn}T00:00:00.000Z`);
    const checkOut = new Date(`${command.checkOut}T00:00:00.000Z`);
    const partySize = PartySize.create(command.partySize);

    return this.tx.run(async () => {
      const snapshot = await this.listings.getSnapshot(command.listingId);
      if (!snapshot) {
        throw new ListingNotFoundException(command.listingId);
      }
      if (partySize.value > snapshot.capacity) {
        throw new PartySizeExceedsCapacityException(
          partySize.value,
          snapshot.capacity,
        );
      }

      const invRange = InventoryDateRange.create(checkIn, checkOut);
      if (await this.listings.hasBlockingBlock(command.listingId, invRange)) {
        throw new DatesNotAvailableException(command.listingId);
      }

      const quote = this.pricing.quote(
        { basePrice: InventoryMoney.create(snapshot.basePrice, snapshot.currency) },
        invRange,
      );

      // Place the hold FIRST — the EXCLUDE constraint is the gate. If it throws
      // OverlappingHoldException the booking is never created and the txn rolls back.
      const hold = Hold.create({
        listingId: command.listingId,
        dateRange: invRange,
        ttlMinutes: HOLD_TTL_MINUTES,
      });
      await this.holds.save(hold);

      const booking = Booking.create({
        guestId: command.guestId,
        listingId: command.listingId,
        holdId: hold.id,
        dateRange: BookingDateRange.create(checkIn, checkOut),
        partySize,
        priceSnapshot: BookingMoney.create(quote.amount, quote.currency),
        holdExpiresAt: hold.expiresAt,
      });
      await this.bookings.save(booking);

      return toBookingSummary(booking);
    });
  }
}
