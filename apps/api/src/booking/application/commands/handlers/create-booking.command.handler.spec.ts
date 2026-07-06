import { CreateBookingHandler } from './create-booking.command.handler';
import { CreateBookingCommand } from '@/booking/application/commands/create-booking.command';
import type { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import type { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import type { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import type { ListingInventoryPort } from '@/inventory/application/ports/listing-inventory.port';
import { PricingService } from '@/inventory/domain/services/pricing.service';
import { OverlappingHoldException } from '@/inventory/domain/exceptions/overlapping-hold.exception';
import { DatesNotAvailableException } from '@/inventory/domain/exceptions/dates-not-available.exception';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { PartySizeExceedsCapacityException } from '@/booking/domain/exceptions/party-size-exceeds-capacity.exception';

/**
 * `CreateBookingHandler` spec: ports mocked, REAL `PricingService` + REAL domain
 * factories (Ken's `Booking`/VOs). RED until Ken implements the Booking domain
 * (the handler calls `Booking.create`, `PartySize.create`, `Money.create`,
 * `DateRange.create`). Green once the domain is filled.
 *
 * Verifies the Partnership orchestration: the whole body runs inside
 * `TransactionManagerPort.run`, the hold is placed BEFORE the booking is saved,
 * and each precondition short-circuits before any write.
 */
describe('CreateBookingHandler', () => {
  const GUEST = '11111111-1111-4111-8111-111111111111';
  const LISTING = '22222222-2222-4222-8222-222222222222';

  function build() {
    const tx: jest.Mocked<TransactionManagerPort> = {
      run: jest.fn((work: () => Promise<unknown>) => work()) as never,
    };
    const listings: jest.Mocked<ListingInventoryPort> = {
      getSnapshot: jest.fn(),
      hasBlockingBlock: jest.fn().mockResolvedValue(false),
    };
    const holds: jest.Mocked<HoldRepositoryPort> = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };
    const bookings: jest.Mocked<BookingRepositoryPort> = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };
    const handler = new CreateBookingHandler(
      tx,
      listings,
      holds,
      bookings,
      new PricingService(),
    );
    return { handler, tx, listings, holds, bookings };
  }

  const command = (partySize = 2): CreateBookingCommand =>
    new CreateBookingCommand(GUEST, LISTING, '2026-07-01', '2026-07-04', partySize);

  it('places a hold, saves the booking, and returns the summary (happy path)', async () => {
    const { handler, tx, listings, holds, bookings } = build();
    listings.getSnapshot.mockResolvedValue({
      listingId: LISTING,
      capacity: 4,
      basePrice: 10_000,
      currency: 'USD',
    });

    const summary = await handler.execute(command());

    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(holds.save).toHaveBeenCalledTimes(1);
    expect(bookings.save).toHaveBeenCalledTimes(1);
    // Hold must be placed before the booking is persisted.
    expect(holds.save.mock.invocationCallOrder[0]).toBeLessThan(
      bookings.save.mock.invocationCallOrder[0],
    );

    expect(summary.listingId).toBe(LISTING);
    expect(summary.status).toBe('PendingPayment');
    expect(summary.checkIn).toBe('2026-07-01');
    expect(summary.checkOut).toBe('2026-07-04');
    expect(summary.partySize).toBe(2);
    // 10000 × 3 nights = 30000 + 10% service fee 3000 = 33000.
    expect(summary.priceSnapshot).toBe(33_000);
    expect(typeof summary.holdExpiresAt).toBe('string');
  });

  it('rejects an unknown listing (no hold placed)', async () => {
    const { handler, listings, holds } = build();
    listings.getSnapshot.mockResolvedValue(null);

    await expect(handler.execute(command())).rejects.toBeInstanceOf(
      ListingNotFoundException,
    );
    expect(holds.save).not.toHaveBeenCalled();
  });

  it('rejects a party larger than capacity (no hold placed)', async () => {
    const { handler, listings, holds } = build();
    listings.getSnapshot.mockResolvedValue({
      listingId: LISTING,
      capacity: 2,
      basePrice: 10_000,
      currency: 'USD',
    });

    await expect(handler.execute(command(5))).rejects.toBeInstanceOf(
      PartySizeExceedsCapacityException,
    );
    expect(holds.save).not.toHaveBeenCalled();
  });

  it('rejects host-blocked dates (no hold placed)', async () => {
    const { handler, listings, holds } = build();
    listings.getSnapshot.mockResolvedValue({
      listingId: LISTING,
      capacity: 4,
      basePrice: 10_000,
      currency: 'USD',
    });
    listings.hasBlockingBlock.mockResolvedValue(true);

    await expect(handler.execute(command())).rejects.toBeInstanceOf(
      DatesNotAvailableException,
    );
    expect(holds.save).not.toHaveBeenCalled();
  });

  it('propagates OverlappingHoldException and never saves the booking', async () => {
    const { handler, listings, holds, bookings } = build();
    listings.getSnapshot.mockResolvedValue({
      listingId: LISTING,
      capacity: 4,
      basePrice: 10_000,
      currency: 'USD',
    });
    holds.save.mockRejectedValue(new OverlappingHoldException(LISTING));

    await expect(handler.execute(command())).rejects.toBeInstanceOf(
      OverlappingHoldException,
    );
    expect(bookings.save).not.toHaveBeenCalled();
  });
});
