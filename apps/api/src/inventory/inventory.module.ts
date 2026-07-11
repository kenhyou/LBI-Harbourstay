import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { IdentityModule } from '@/identity/identity.module';
import { AvailabilityController } from '@/inventory/presenters/http/availability.controller';
import { HostListingController } from '@/inventory/presenters/http/host-listing.controller';
import { AvailabilityService } from '@/inventory/application/services/availability.service';
import { HostListingService } from '@/inventory/application/services/host-listing.service';
import { GetAvailabilityHandler } from '@/inventory/application/queries/handlers/get-availability.query.handler';
import { GetHostListingsHandler } from '@/inventory/application/queries/handlers/get-host-listings.query.handler';
import { GetHostListingDetailHandler } from '@/inventory/application/queries/handlers/get-host-listing-detail.query.handler';
import { CreateListingHandler } from '@/inventory/application/commands/handlers/create-listing.command.handler';
import { UpdateListingHandler } from '@/inventory/application/commands/handlers/update-listing.command.handler';
import { PublishListingHandler } from '@/inventory/application/commands/handlers/publish-listing.command.handler';
import { UnpublishListingHandler } from '@/inventory/application/commands/handlers/unpublish-listing.command.handler';
import { PricingService } from '@/inventory/domain/services/pricing.service';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { ListingInventoryPort } from '@/inventory/application/ports/listing-inventory.port';
import { AvailabilityQueryPort } from '@/inventory/application/ports/availability.query.port';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';
import { HoldRepository } from '@/inventory/infra/repositories/hold.repository';
import { ListingRepository } from '@/inventory/infra/repositories/listing.repository';
import { ListingInventoryQuery } from '@/inventory/infra/queries/listing-inventory.query';
import { AvailabilityQuery } from '@/inventory/infra/queries/availability.query';
import { HostListingsQuery } from '@/inventory/infra/queries/host-listings.query';

const commandHandlers = [
  CreateListingHandler,
  UpdateListingHandler,
  PublishListingHandler,
  UnpublishListingHandler,
];
const queryHandlers = [
  GetAvailabilityHandler,
  GetHostListingsHandler,
  GetHostListingDetailHandler,
];

/**
 * BC-2 Availability & Inventory. Owns the `Hold` write side (behind the EXCLUDE
 * guarantee), the `Listing` write side (S6a — the host CRUD surface), the pricing
 * domain service, and the availability read side. Binds each port to its impl
 * ONCE. Exports the seam providers (`HoldRepositoryPort`, `ListingInventoryPort`,
 * `PricingService`) so the Booking BC can orchestrate the Partnership
 * create-booking transaction WITHOUT a module cycle.
 *
 * Imports `IdentityModule` (S6a) for `JwtCookieGuard` + `RolesGuard` — the host
 * controller is the first route to combine cookie auth with `@Roles('host')`.
 * `TransactionManagerPort` comes from the global `TransactionModule`.
 */
@Module({
  imports: [CqrsModule, PrismaModule, IdentityModule],
  controllers: [AvailabilityController, HostListingController],
  providers: [
    AvailabilityService,
    HostListingService,
    PricingService,
    { provide: HoldRepositoryPort, useClass: HoldRepository },
    { provide: ListingInventoryPort, useClass: ListingInventoryQuery },
    { provide: AvailabilityQueryPort, useClass: AvailabilityQuery },
    { provide: ListingRepositoryPort, useClass: ListingRepository },
    { provide: HostListingsQueryPort, useClass: HostListingsQuery },
    ...commandHandlers,
    ...queryHandlers,
  ],
  exports: [HoldRepositoryPort, ListingInventoryPort, PricingService],
})
export class InventoryModule {}
