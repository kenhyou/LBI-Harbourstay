import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { IdentityModule } from '@/identity/identity.module';
import { BookingController } from '@/booking/presenters/http/booking.controller';
import { BookingService } from '@/booking/application/services/booking.service';
import { CreateBookingHandler } from '@/booking/application/commands/handlers/create-booking.command.handler';
import { GetBookingHandler } from '@/booking/application/queries/handlers/get-booking.query.handler';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingQueryPort } from '@/booking/application/ports/booking.query.port';
import { BookingRepository } from '@/booking/infra/repositories/booking.repository';
import { BookingQuery } from '@/booking/infra/queries/booking.query';

const commandHandlers = [CreateBookingHandler];
const queryHandlers = [GetBookingHandler];

/**
 * BC-1 Booking. Binds the booking write port to its Prisma impl, registers the
 * CQRS command handler, and wires the presenter. Imports:
 * - `InventoryModule` (Partnership seam — one-directional; provides
 *   `HoldRepositoryPort`, `ListingInventoryPort`, `PricingService`). No cycle,
 *   so no `forwardRef`.
 * - `IdentityModule` (exports `JwtCookieGuard` for the auth-guarded route).
 * `TransactionManagerPort` comes from the global `TransactionModule`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, InventoryModule, IdentityModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    { provide: BookingRepositoryPort, useClass: BookingRepository },
    { provide: BookingQueryPort, useClass: BookingQuery },
    ...commandHandlers,
    ...queryHandlers,
  ],
})
export class BookingModule {}
