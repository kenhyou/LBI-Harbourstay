import { CancellationPolicy } from '@/booking/domain/policies/cancellation-policy';

/**
 * Seam for obtaining the `CancellationPolicy` that applies to a listing. For the
 * MVP every listing shares the single `CancellationPolicy.standard()`, but the
 * Cancel-Booking handler depends on THIS port (not the concrete policy) so a
 * per-listing policy (loaded from the DB) can arrive later without touching the
 * handler. Bound to its impl in exactly one module.
 *
 * Returns a domain policy object; it deliberately does NOT leak refund tiers —
 * those live inside `CancellationPolicy.evaluate`.
 */
export abstract class CancellationPolicyProviderPort {
  /** The cancellation policy in force for `listingId`. */
  abstract forListing(listingId: string): Promise<CancellationPolicy>;
}
