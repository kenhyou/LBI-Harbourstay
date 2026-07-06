import { Hold } from '@/inventory/domain/models/hold.model';

/**
 * Write-side persistence port for the `Hold` aggregate (BC-2). Bound to its
 * Prisma impl in exactly one module. The impl is where the overbooking guarantee
 * is enforced: a `save` that violates the `no_overlapping_holds` EXCLUDE surfaces
 * as `OverlappingHoldException` (the infra catches SQLSTATE 23P01).
 */
export abstract class HoldRepositoryPort {
  /**
   * Insert/update the Hold. On an overlapping active/committed hold for the same
   * listing, throws `OverlappingHoldException` (never a raw Prisma error).
   */
  abstract save(hold: Hold): Promise<void>;

  /** Load by id, or `null`. */
  abstract findById(id: string): Promise<Hold | null>;
}
