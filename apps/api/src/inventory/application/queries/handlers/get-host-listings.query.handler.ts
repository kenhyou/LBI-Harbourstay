import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { HostListingsResponse } from '@harbourstay/shared';
import { GetHostListingsQuery } from '@/inventory/application/queries/get-host-listings.query';
import { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';

/**
 * CQRS read handler for `GET /host/listings`. Pure projection — delegates to the
 * host-scoped query port and returns the host's own listings (drafts included) as
 * `hostListingSummary[]`. Bypasses the domain entirely: no aggregate is loaded,
 * because a read never needs the write model's behaviour.
 */
@QueryHandler(GetHostListingsQuery)
export class GetHostListingsHandler
  implements IQueryHandler<GetHostListingsQuery, HostListingsResponse>
{
  constructor(private readonly listings: HostListingsQueryPort) {}

  execute(query: GetHostListingsQuery): Promise<HostListingsResponse> {
    return this.listings.listForHost(query.hostId);
  }
}
