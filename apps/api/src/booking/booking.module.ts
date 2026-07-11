import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { IdentityModule } from '@/identity/identity.module';
import { OutboxModule } from '@/shared/outbox/outbox.module';
import { BookingController } from '@/booking/presenters/http/booking.controller';
import { BookingService } from '@/booking/application/services/booking.service';
import { CreateBookingHandler } from '@/booking/application/commands/handlers/create-booking.command.handler';
import { CancelBookingHandler } from '@/booking/application/commands/handlers/cancel-booking.command.handler';
import { GetBookingHandler } from '@/booking/application/queries/handlers/get-booking.query.handler';
import { MyBookingsHandler } from '@/booking/application/queries/handlers/my-bookings.query.handler';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';
import { CancellationPolicyProviderPort } from '@/booking/application/ports/cancellation-policy.provider.port';
import { BookingRepository } from '@/booking/infra/repositories/booking.repository';
import { BookingQuery } from '@/booking/infra/queries/booking.query';
import { StandardCancellationPolicyProvider } from '@/booking/infra/adapters/standard-cancellation-policy.provider';

const commandHandlers = [CreateBookingHandler, CancelBookingHandler];
const queryHandlers = [GetBookingHandler, MyBookingsHandler];

/**
 * BC-1 Booking. Binds the booking write/read/policy ports to their impls, registers
 * the CQRS command + query handlers, and wires the presenter. Imports:
 * - `InventoryModule` (Partnership seam — provides `HoldRepositoryPort`,
 *   `ListingInventoryPort`, `PricingService`; the S5 cancel path releases the Hold).
 * - `IdentityModule` (exports `JwtCookieGuard` for the auth-guarded routes).
 * - `OutboxModule` (exports `OutboxPort` — the Cancel-Booking handler enqueues
 *   `BookingCancelled` inside the cancellation transaction).
 * No cycles, so no `forwardRef`. `TransactionManagerPort` comes from the global
 * `TransactionModule`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, InventoryModule, IdentityModule, OutboxModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    { provide: BookingRepositoryPort, useClass: BookingRepository },
    { provide: BookingQueryPort, useClass: BookingQuery },
    {
      provide: CancellationPolicyProviderPort,
      useClass: StandardCancellationPolicyProvider,
    },
    ...commandHandlers,
    ...queryHandlers,
  ],
  // Exported so BC-3 Payment's `BookingCheckoutSaga` can load/save the Booking
  // aggregate (confirm on payment success, expire on failure/expiry) without a
  // module cycle — Payment imports Booking, never the reverse.
  exports: [BookingRepositoryPort],
})
export class BookingModule {}
