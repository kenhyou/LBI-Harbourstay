import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { AvailabilityQuery, ListingAvailability } from '@harbourstay/shared';
import { GetAvailabilityQuery } from '@/inventory/application/queries/get-availability.query';

/**
 * Thin QueryBus facade for the BC-2 availability read side. The controller talks
 * only to this.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly queryBus: QueryBus) {}

  getAvailability(
    listingId: string,
    window: AvailabilityQuery,
  ): Promise<ListingAvailability> {
    return this.queryBus.execute(
      new GetAvailabilityQuery(listingId, window.from, window.to),
    );
  }
}
