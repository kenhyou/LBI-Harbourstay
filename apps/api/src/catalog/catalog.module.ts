import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ListingController } from '@/catalog/presenters/http/listing.controller';
import { ListingService } from '@/catalog/application/services/listing.service';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';
import { ListingQuery } from '@/catalog/infra/queries/listing.query';
import { SearchListingsQueryHandler } from '@/catalog/application/queries/handlers/search-listings.query.handler';
import { GetListingDetailQueryHandler } from '@/catalog/application/queries/handlers/get-listing-detail.query.handler';

const queryHandlers = [SearchListingsQueryHandler, GetListingDetailQueryHandler];

/**
 * BC-5 Listing Catalog & Search (CQRS read side). Binds the Query Port to its
 * Prisma-backed impl in exactly one place, registers the read handlers, and
 * imports PrismaModule for DB access.
 */
@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [ListingController],
  providers: [
    ListingService,
    { provide: ListingQueryPort, useClass: ListingQuery },
    ...queryHandlers,
  ],
})
export class CatalogModule {}
