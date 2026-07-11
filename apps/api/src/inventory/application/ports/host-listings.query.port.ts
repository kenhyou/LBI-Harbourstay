import type { HostListingDetail, HostListingSummary } from '@harbourstay/shared';

/**
 * Read-side (CQRS) port for the host dashboard. Projects Prisma `listing` rows
 * owned by the given host DIRECTLY into the shared DTOs — no aggregate, no
 * reconstitution (that read cost is only paid on the WRITE path). Bound to
 * `HostListingsQuery` (infra) in exactly one module.
 *
 * Unlike the guest-facing catalog read (S1), this is NOT filtered to Published —
 * a host sees their own drafts too (editing a draft is the reason the detail read
 * exists). Ownership is enforced IN the query: a row not owned by `hostId` reads
 * as absent, so "not yours" and "doesn't exist" are indistinguishable (no-leak).
 */
export abstract class HostListingsQueryPort {
  /** Every listing owned by `hostId` (drafts included), newest first. */
  abstract listForHost(hostId: string): Promise<HostListingSummary[]>;

  /**
   * One listing's full editable detail IFF it exists AND belongs to `hostId`,
   * else `null` (the handler turns null into a 404-no-leak). Includes drafts.
   */
  abstract getDetailForHost(
    id: string,
    hostId: string,
  ): Promise<HostListingDetail | null>;
}
