import { DomainException } from '@/shared/exceptions/domain.exception';

/**
 * Raised by `Listing.unblock()` when the given block id is not among the
 * listing's current blocks. We throw (→ 404) rather than silently no-op because
 * the caller has ALREADY passed the ownership gate — this is the host's own
 * listing — so "no such block here" is genuine, non-leaking information the UI
 * can act on (the block was already removed, or the id is stale after a concurrent
 * edit). A DELETE of a resource that isn't there is a 404 by REST convention, and
 * a loud failure surfaces client/state bugs a no-op would hide. Mapped to `404`.
 */
export class BlockNotFoundException extends DomainException {
  readonly code = 'BLOCK_NOT_FOUND';

  constructor(blockId: string) {
    super(`No such block ${blockId} on this listing`);
  }
}
