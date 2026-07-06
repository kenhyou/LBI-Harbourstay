import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { AvailabilityController } from '@/inventory/presenters/http/availability.controller';
import { AvailabilityService } from '@/inventory/application/services/availability.service';
import { GetAvailabilityHandler } from '@/inventory/application/queries/handlers/get-availability.query.handler';
import { PricingService } from '@/inventory/domain/services/pricing.service';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { ListingInventoryPort } from '@/inventory/application/ports/listing-inventory.port';
import { AvailabilityQueryPort } from '@/inventory/application/ports/availability.query.port';
import { HoldRepository } from '@/inventory/infra/repositories/hold.repository';
import { ListingInventoryQuery } from '@/inventory/infra/queries/listing-inventory.query';
import { AvailabilityQuery } from '@/inventory/infra/queries/availability.query';

const queryHandlers = [GetAvailabilityHandler];

/**
 * BC-2 Availability & Inventory. Owns the `Hold` write side (behind the EXCLUDE
 * guarantee), the pricing domain service, and the availability read side. Binds
 * each port to its impl ONCE. Exports the seam providers (`HoldRepositoryPort`,
 * `ListingInventoryPort`, `PricingService`) so the Booking BC can orchestrate the
 * Partnership create-booking transaction WITHOUT a module cycle.
 */
@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [AvailabilityController],
  providers: [
    AvailabilityService,
    PricingService,
    { provide: HoldRepositoryPort, useClass: HoldRepository },
    { provide: ListingInventoryPort, useClass: ListingInventoryQuery },
    { provide: AvailabilityQueryPort, useClass: AvailabilityQuery },
    ...queryHandlers,
  ],
  exports: [HoldRepositoryPort, ListingInventoryPort, PricingService],
})
export class InventoryModule {}
